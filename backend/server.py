from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import json
import re
import uuid
import io
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List
from PIL import Image, ImageDraw

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


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


# --- Category descriptions for the AI prompt ---

CATEGORY_DESCRIPTIONS = {
    "barre_tonde": "round solid bars (circular cross-sections, like rebar or steel rods viewed from the end)",
    "barre_quadre": "square solid bars (square cross-sections viewed from the end)",
    "barre_rettangolari": "rectangular solid bars (rectangular cross-sections viewed from the end)",
    "barre_esagonali": "hexagonal solid bars (hexagonal cross-sections viewed from the end)",
    "barre_generiche": "solid bars of any shape (various cross-section geometries viewed from the end)",
    "tubi_tondi": "round tubes or pipes (circular cross-sections with a hollow center, viewed from the end)",
    "tubi_quadri": "square tubes (square cross-sections with a hollow center, viewed from the end)",
    "tubi_rettangolari": "rectangular tubes (rectangular cross-sections with a hollow center, viewed from the end)",
    "tubi_generici": "tubes or pipes of any shape (cross-sections with hollow center, viewed from the end)",
    "profili_l": "L-shaped angle profiles (L-shaped cross-sections, viewed from the end)",
    "profili_t": "T-shaped profiles (T-shaped cross-sections, viewed from the end)",
    "travi_ipe": "IPE beams / I-beams / H-beams (I-shaped or H-shaped cross-sections, viewed from the end)",
}


# --- Endpoints ---

@api_router.get("/")
async def root():
    return {"message": "CountApp API is running"}


@api_router.post("/count", response_model=CountResponse)
async def count_objects(request: CountRequest):
    try:
        # Decode the image
        image_data = base64.b64decode(request.image_base64)
        image = Image.open(io.BytesIO(image_data)).convert('RGB')
        img_width, img_height = image.size

        logger.info(f"Processing image: {img_width}x{img_height}, category: {request.category}")

        # Create mask from areas
        mask = Image.new('L', (img_width, img_height), 0)
        draw = ImageDraw.Draw(mask)

        # Apply include areas
        for area in request.include_areas:
            if len(area.points) >= 3:
                polygon = [
                    (int(p.x * img_width / 100), int(p.y * img_height / 100))
                    for p in area.points
                ]
                draw.polygon(polygon, fill=255)

        # Apply exclude areas
        for area in request.exclude_areas:
            if len(area.points) >= 3:
                polygon = [
                    (int(p.x * img_width / 100), int(p.y * img_height / 100))
                    for p in area.points
                ]
                draw.polygon(polygon, fill=0)

        # Apply mask - gray out excluded areas
        gray_bg = Image.new('RGB', (img_width, img_height), (100, 100, 100))
        masked_image = Image.composite(image, gray_bg, mask)

        # Resize if too large (save bandwidth)
        MAX_DIM = 2048
        if img_width > MAX_DIM or img_height > MAX_DIM:
            ratio = min(MAX_DIM / img_width, MAX_DIM / img_height)
            new_size = (int(img_width * ratio), int(img_height * ratio))
            masked_image = masked_image.resize(new_size, Image.LANCZOS)
            logger.info(f"Resized image to: {new_size}")

        # Convert masked image to base64
        buffer = io.BytesIO()
        masked_image.save(buffer, format='JPEG', quality=85)
        masked_b64 = base64.b64encode(buffer.getvalue()).decode()

        # Get category description
        cat_desc = CATEGORY_DESCRIPTIONS.get(request.category, "objects")

        # Call GPT-4o for counting
        session_id = f"count-{uuid.uuid4()}"
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message="""You are an expert industrial object counter. You analyze photographs of stacked metal bars, tubes, and structural profiles to count them with extreme precision.

CRITICAL RULES:
1. ONLY count objects in the BRIGHT/CLEAR area of the image. The grayed-out areas must be COMPLETELY IGNORED.
2. Count each DISTINCT object cross-section separately. Each bar end, tube end, or profile end is ONE object.
3. Be extremely thorough - count EVERY visible object, including partially visible ones at edges.
4. Provide the CENTER position of each object as a PERCENTAGE of the full image (x: 0-100, y: 0-100), where (0,0) is top-left.
5. Return ONLY valid JSON, nothing else. No markdown, no explanation.
6. When in doubt about whether something is an object or background, count it."""
        )
        chat.with_model("openai", "gpt-4o")

        image_content = ImageContent(image_base64=masked_b64)

        user_msg = UserMessage(
            text=f"""Count ALL visible {cat_desc} in the bright/clear area of this image. The gray areas should be ignored completely.

Return ONLY this JSON (no markdown, no extra text):
{{"count": <number>, "objects": [{{"id": 1, "x": <x_percent_0_to_100>, "y": <y_percent_0_to_100>}}, ...]}}

Count EVERY single visible {cat_desc}. Be extremely precise and thorough.""",
            file_contents=[image_content]
        )

        logger.info("Sending image to GPT-4o for analysis...")
        response = await chat.send_message(user_msg)
        logger.info(f"GPT-4o response received: {response[:200]}...")

        # Parse response - extract JSON
        response_text = response.strip()

        # Try to extract JSON from markdown code blocks
        code_block = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
        if code_block:
            response_text = code_block.group(1).strip()
        elif not response_text.startswith('{'):
            start = response_text.find('{')
            end = response_text.rfind('}')
            if start != -1 and end != -1:
                response_text = response_text[start:end + 1]

        result = json.loads(response_text)

        count = result.get("count", 0)
        objects = [
            DetectedObject(id=obj["id"], x=float(obj["x"]), y=float(obj["y"]))
            for obj in result.get("objects", [])
        ]

        logger.info(f"Count result: {count} objects detected")

        return CountResponse(count=count, objects=objects)

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response as JSON: {e}")
        logger.error(f"Raw response: {response_text[:500] if 'response_text' in dir() else 'N/A'}")
        return CountResponse(count=0, objects=[])
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
