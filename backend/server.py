from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import json
import uuid
import io
import numpy as np
import cv2
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
from PIL import Image, ImageDraw

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# --- YOLO Model Loading ---
YOLO_MODEL = None
try:
    from ultralytics import YOLO
    model_path = ROOT_DIR / "yolo11n.pt"
    if not model_path.exists():
        logger.info("Downloading YOLO11n model...")
        YOLO_MODEL = YOLO("yolo11n.pt")
    else:
        YOLO_MODEL = YOLO(str(model_path))
    logger.info("YOLO model loaded successfully")
except Exception as e:
    logger.warning(f"Could not load YOLO model: {e}")
    YOLO_MODEL = None


# --- Models ---
class PointModel(BaseModel):
    x: float
    y: float

class AreaModel(BaseModel):
    points: List[PointModel]
    mode: str

class CountRequest(BaseModel):
    image_base64: str
    category: str
    include_areas: List[AreaModel]
    exclude_areas: List[AreaModel] = []

class DetectedObject(BaseModel):
    id: int
    x: float
    y: float

class CountResponse(BaseModel):
    count: int
    objects: List[DetectedObject]


# --- Category types ---
CIRCULAR_CATEGORIES = {
    "barre_tonde", "barre_quadre", "barre_rettangolari",
    "barre_esagonali", "barre_generiche",
    "tubi_tondi", "tubi_quadri", "tubi_rettangolari", "tubi_generici",
}
PROFILE_CATEGORIES = {"profili_l", "profili_t", "travi_ipe"}


# --- OpenCV Detection Functions ---

def detect_circles_hough(gray, mask_np):
    """Detect circular objects using Hough Circle Transform."""
    h, w = gray.shape[:2]

    # CLAHE for better contrast
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Blur
    blurred = cv2.GaussianBlur(enhanced, (9, 9), 2)

    # Estimate circle size from image
    min_dim = min(h, w)
    min_r = max(3, int(min_dim * 0.005))
    max_r = max(20, int(min_dim * 0.15))
    min_dist = max(10, int(min_r * 1.5))

    best_objects = []

    # Try multiple param2 values to find optimal detection
    for param2 in [25, 35, 45, 55]:
        circles = cv2.HoughCircles(
            blurred,
            cv2.HOUGH_GRADIENT,
            dp=1.2,
            minDist=min_dist,
            param1=100,
            param2=param2,
            minRadius=min_r,
            maxRadius=max_r
        )
        if circles is not None:
            valid = []
            for (x, y, r) in circles[0]:
                cx, cy = int(x), int(y)
                if 0 <= cx < w and 0 <= cy < h and mask_np[cy, cx] > 0:
                    valid.append({"x": float(x / w * 100), "y": float(y / h * 100)})
            if len(valid) > len(best_objects):
                best_objects = valid

    return best_objects


def detect_with_watershed(gray, mask_np):
    """Detect objects using watershed segmentation - good for tightly packed objects."""
    h, w = gray.shape[:2]

    # CLAHE
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # Apply mask
    enhanced = cv2.bitwise_and(enhanced, enhanced, mask=mask_np)

    # Adaptive threshold
    thresh = cv2.adaptiveThreshold(
        enhanced, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=21,
        C=4
    )

    # Clean up
    kernel = np.ones((3, 3), np.uint8)
    cleaned = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=2)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_CLOSE, kernel, iterations=2)

    # Distance transform
    dist = cv2.distanceTransform(cleaned, cv2.DIST_L2, 5)
    if dist.max() == 0:
        return []

    # Find sure foreground
    _, sure_fg = cv2.threshold(dist, 0.4 * dist.max(), 255, 0)
    sure_fg = np.uint8(sure_fg)

    # Connected components
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(sure_fg)

    min_area = max(20, (w * h) * 0.0003)
    max_area = (w * h) * 0.15

    objects = []
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < min_area or area > max_area:
            continue
        cx, cy = centroids[i]
        cx_int, cy_int = int(cx), int(cy)
        if 0 <= cx_int < w and 0 <= cy_int < h and mask_np[cy_int, cx_int] > 0:
            objects.append({"x": float(cx / w * 100), "y": float(cy / h * 100)})

    return objects


def detect_contours(gray, mask_np):
    """Detect objects using contour analysis - for non-circular shapes."""
    h, w = gray.shape[:2]

    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    enhanced = cv2.bitwise_and(enhanced, enhanced, mask=mask_np)

    # Edge detection
    edges = cv2.Canny(enhanced, 50, 150)

    # Dilate to connect edges
    kernel = np.ones((3, 3), np.uint8)
    dilated = cv2.dilate(edges, kernel, iterations=2)

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_area = max(50, (w * h) * 0.001)
    max_area = (w * h) * 0.2

    objects = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area or area > max_area:
            continue
        M = cv2.moments(contour)
        if M["m00"] == 0:
            continue
        cx = int(M["m10"] / M["m00"])
        cy = int(M["m01"] / M["m00"])
        if 0 <= cx < w and 0 <= cy < h and mask_np[cy, cx] > 0:
            objects.append({"x": float(cx / w * 100), "y": float(cy / h * 100)})

    return objects


def detect_with_yolo(image_np, mask_np):
    """Try YOLO detection on the image."""
    if YOLO_MODEL is None:
        return []

    try:
        results = YOLO_MODEL(image_np, verbose=False, conf=0.25)
        h, w = image_np.shape[:2]
        objects = []

        for result in results:
            if result.boxes is not None:
                for box in result.boxes:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    cx = (x1 + x2) / 2
                    cy = (y1 + y2) / 2
                    cx_int, cy_int = int(cx), int(cy)
                    if 0 <= cx_int < w and 0 <= cy_int < h and mask_np[cy_int, cx_int] > 0:
                        objects.append({
                            "x": float(cx / w * 100),
                            "y": float(cy / h * 100)
                        })

        return objects
    except Exception as e:
        logger.warning(f"YOLO detection error: {e}")
        return []


def merge_detections(detections_list, min_distance_pct=3.0):
    """Merge multiple detection results, removing duplicates."""
    all_objects = []
    for detections in detections_list:
        all_objects.extend(detections)

    if not all_objects:
        return []

    # Remove near-duplicates
    merged = [all_objects[0]]
    for obj in all_objects[1:]:
        is_dup = False
        for existing in merged:
            dist = ((obj["x"] - existing["x"]) ** 2 + (obj["y"] - existing["y"]) ** 2) ** 0.5
            if dist < min_distance_pct:
                is_dup = True
                break
        if not is_dup:
            merged.append(obj)

    # Assign sequential IDs
    for i, obj in enumerate(merged):
        obj["id"] = i + 1

    return merged


# --- Endpoints ---

@api_router.get("/")
async def root():
    return {"message": "CountApp API is running"}


@api_router.post("/count", response_model=CountResponse)
async def count_objects(request: CountRequest):
    try:
        # Decode the image
        image_data = base64.b64decode(request.image_base64)
        pil_image = Image.open(io.BytesIO(image_data)).convert('RGB')
        img_width, img_height = pil_image.size

        logger.info(f"Processing image: {img_width}x{img_height}, category: {request.category}")

        # Create mask from areas using PIL
        mask_pil = Image.new('L', (img_width, img_height), 0)
        draw = ImageDraw.Draw(mask_pil)

        for area in request.include_areas:
            if len(area.points) >= 3:
                polygon = [
                    (int(p.x * img_width / 100), int(p.y * img_height / 100))
                    for p in area.points
                ]
                draw.polygon(polygon, fill=255)

        for area in request.exclude_areas:
            if len(area.points) >= 3:
                polygon = [
                    (int(p.x * img_width / 100), int(p.y * img_height / 100))
                    for p in area.points
                ]
                draw.polygon(polygon, fill=0)

        # Convert to numpy arrays for OpenCV
        image_np = np.array(pil_image)
        image_bgr = cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR)
        mask_np = np.array(mask_pil)

        # Apply mask to create masked image
        masked_bgr = cv2.bitwise_and(image_bgr, image_bgr, mask=mask_np)
        gray = cv2.cvtColor(masked_bgr, cv2.COLOR_BGR2GRAY)

        # Resize if too large
        MAX_DIM = 2048
        scale = 1.0
        if img_width > MAX_DIM or img_height > MAX_DIM:
            scale = min(MAX_DIM / img_width, MAX_DIM / img_height)
            new_w, new_h = int(img_width * scale), int(img_height * scale)
            image_bgr = cv2.resize(image_bgr, (new_w, new_h))
            mask_np = cv2.resize(mask_np, (new_w, new_h))
            gray = cv2.resize(gray, (new_w, new_h))
            masked_bgr = cv2.resize(masked_bgr, (new_w, new_h))
            logger.info(f"Resized to: {new_w}x{new_h}")

        # Run detections
        all_detections = []

        # 1. YOLO detection
        yolo_results = detect_with_yolo(masked_bgr, mask_np)
        logger.info(f"YOLO detected: {len(yolo_results)} objects")
        if yolo_results:
            all_detections.append(yolo_results)

        # 2. OpenCV detection based on category
        if request.category in CIRCULAR_CATEGORIES:
            # Hough circles
            hough_results = detect_circles_hough(gray, mask_np)
            logger.info(f"Hough circles detected: {len(hough_results)} objects")
            if hough_results:
                all_detections.append(hough_results)

            # Watershed
            watershed_results = detect_with_watershed(gray, mask_np)
            logger.info(f"Watershed detected: {len(watershed_results)} objects")
            if watershed_results:
                all_detections.append(watershed_results)
        else:
            # Contour detection for profiles
            contour_results = detect_contours(gray, mask_np)
            logger.info(f"Contour detected: {len(contour_results)} objects")
            if contour_results:
                all_detections.append(contour_results)

        # Pick the detection method with most results
        if all_detections:
            best_detection = max(all_detections, key=len)
            # Assign IDs
            for i, obj in enumerate(best_detection):
                obj["id"] = i + 1
            objects = best_detection
        else:
            objects = []

        count = len(objects)
        logger.info(f"Final count: {count} objects")

        return CountResponse(
            count=count,
            objects=[DetectedObject(**obj) for obj in objects]
        )

    except Exception as e:
        logger.error(f"Error in count_objects: {e}", exc_info=True)
        return CountResponse(count=0, objects=[])


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
