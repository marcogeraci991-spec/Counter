from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import uuid
import io
import numpy as np
import cv2
from pathlib import Path
from pydantic import BaseModel
from typing import List
from PIL import Image, ImageDraw

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- YOLO ---
YOLO_MODEL = None
try:
    from ultralytics import YOLO
    model_path = ROOT_DIR / "yolo11n.pt"
    YOLO_MODEL = YOLO("yolo11n.pt" if not model_path.exists() else str(model_path))
    logger.info("YOLO model loaded")
except Exception as e:
    logger.warning(f"YOLO not available: {e}")


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
    sensitivity: float = 0.5

class DetectedObject(BaseModel):
    id: int
    x: float
    y: float
    radius: float = 2.0

class CountResponse(BaseModel):
    count: int
    objects: List[DetectedObject]


CIRCULAR_CATEGORIES = {
    "barre_tonde", "barre_quadre", "barre_rettangolari",
    "barre_esagonali", "barre_generiche",
    "tubi_tondi", "tubi_quadri", "tubi_rettangolari", "tubi_generici",
}


def detect_circles_hough(gray, mask_np, sensitivity=0.5):
    """Detect circular objects - restored proven algorithm with minor speed optimization."""
    h, w = gray.shape[:2]
    mask_area = int(np.sum(mask_np > 0))
    if mask_area < 100:
        return []

    est_r = int(np.sqrt(mask_area / 40 / np.pi))
    min_r = max(8, est_r // 3)
    max_r = max(30, est_r * 2)
    min_dist = max(15, int(est_r * 0.8))

    # Sensitivity: 0.1 -> param2=75 (selective), 0.5 -> param2=52, 1.0 -> param2=30
    base_param2 = int(75 - sensitivity * 45)
    param2_values = [base_param2, base_param2 + 10]
    param2_values = [max(25, min(80, p)) for p in param2_values]

    logger.info(f"Hough: est_r={est_r}, minR={min_r}, maxR={max_r}, minDist={min_dist}, sens={sensitivity:.2f}, p2={param2_values}")

    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (9, 9), 2)

    best_objects = []
    for param2 in param2_values:
        circles = cv2.HoughCircles(
            blurred, cv2.HOUGH_GRADIENT,
            dp=1.2, minDist=min_dist,
            param1=100, param2=param2,
            minRadius=min_r, maxRadius=max_r
        )
        if circles is not None:
            valid = []
            for (x, y, r) in circles[0]:
                cx, cy = int(x), int(y)
                if 0 <= cx < w and 0 <= cy < h and mask_np[cy, cx] > 0:
                    valid.append({"x": float(x / w * 100), "y": float(y / h * 100), "radius": float(r / w * 100)})
            logger.info(f"  param2={param2}: {len(valid)} circles")
            if len(valid) > len(best_objects):
                best_objects = valid

    return best_objects


def detect_contours(gray, mask_np):
    """Detect objects using contour analysis for non-circular shapes."""
    h, w = gray.shape[:2]
    mask_area = int(np.sum(mask_np > 0))
    if mask_area < 100:
        return []

    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    enhanced = cv2.bitwise_and(enhanced, enhanced, mask=mask_np)

    edges = cv2.Canny(enhanced, 50, 150)
    kernel = np.ones((5, 5), np.uint8)
    dilated = cv2.dilate(edges, kernel, iterations=2)
    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Size filtering based on mask area
    est_obj_area = mask_area / 40
    min_area = max(50, est_obj_area * 0.1)
    max_area = est_obj_area * 5

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


# --- Endpoints ---
@api_router.get("/")
async def root():
    return {"message": "CountApp API is running"}


@api_router.post("/count", response_model=CountResponse)
async def count_objects(request: CountRequest):
    try:
        image_data = base64.b64decode(request.image_base64)
        pil_image = Image.open(io.BytesIO(image_data)).convert('RGB')
        img_width, img_height = pil_image.size
        logger.info(f"Processing: {img_width}x{img_height}, category: {request.category}")

        # Build mask
        mask_pil = Image.new('L', (img_width, img_height), 0)
        draw = ImageDraw.Draw(mask_pil)
        for area in request.include_areas:
            if len(area.points) >= 3:
                poly = [(int(p.x * img_width / 100), int(p.y * img_height / 100)) for p in area.points]
                draw.polygon(poly, fill=255)
        for area in request.exclude_areas:
            if len(area.points) >= 3:
                poly = [(int(p.x * img_width / 100), int(p.y * img_height / 100)) for p in area.points]
                draw.polygon(poly, fill=0)

        image_np = np.array(pil_image)
        image_bgr = cv2.cvtColor(image_np, cv2.COLOR_RGB2BGR)
        mask_np = np.array(mask_pil)

        # Resize if needed
        MAX_DIM = 2048
        if img_width > MAX_DIM or img_height > MAX_DIM:
            scale = min(MAX_DIM / img_width, MAX_DIM / img_height)
            new_w, new_h = int(img_width * scale), int(img_height * scale)
            image_bgr = cv2.resize(image_bgr, (new_w, new_h))
            mask_np = cv2.resize(mask_np, (new_w, new_h))

        masked_bgr = cv2.bitwise_and(image_bgr, image_bgr, mask=mask_np)
        gray = cv2.cvtColor(masked_bgr, cv2.COLOR_BGR2GRAY)

        # Detect based on category
        sens = max(0.1, min(1.0, request.sensitivity))
        if request.category in CIRCULAR_CATEGORIES:
            objects = detect_circles_hough(gray, mask_np, sens)
        else:
            objects = detect_contours(gray, mask_np)

        # Assign IDs
        for i, obj in enumerate(objects):
            obj["id"] = i + 1

        logger.info(f"Final count: {len(objects)} objects")
        return CountResponse(count=len(objects), objects=[DetectedObject(**o) for o in objects])

    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return CountResponse(count=0, objects=[])


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
