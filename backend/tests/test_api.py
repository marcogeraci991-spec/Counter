"""
Backend API tests for CountApp
Tests: Health check, Count endpoint with image processing
"""
import pytest
import requests
import base64
from io import BytesIO
from PIL import Image, ImageDraw


def create_test_image_base64():
    """Create a simple test image with 4 circular objects (simulating bar ends)"""
    # Create 200x200 white background
    img = Image.new('RGB', (200, 200), color='white')
    draw = ImageDraw.Draw(img)
    
    # Draw 4 circles to simulate bar ends
    # Top-left
    draw.ellipse([30, 30, 70, 70], fill='gray', outline='black')
    # Top-right
    draw.ellipse([130, 30, 170, 70], fill='gray', outline='black')
    # Bottom-left
    draw.ellipse([30, 130, 70, 170], fill='gray', outline='black')
    # Bottom-right
    draw.ellipse([130, 130, 170, 170], fill='gray', outline='black')
    
    # Convert to base64
    buffer = BytesIO()
    img.save(buffer, format='JPEG')
    return base64.b64encode(buffer.getvalue()).decode()


class TestHealthCheck:
    """Health check endpoint tests"""
    
    def test_health_endpoint(self, api_client, base_url):
        """Test GET /api/ returns 200 and correct message"""
        response = api_client.get(f"{base_url}/api/")
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        assert data["message"] == "CountApp API is running"


class TestCountEndpoint:
    """Count endpoint tests"""
    
    def test_count_endpoint_with_valid_image(self, api_client, base_url):
        """Test POST /api/count with valid image and include area"""
        image_b64 = create_test_image_base64()
        
        payload = {
            "image_base64": image_b64,
            "category": "barre_tonde",
            "include_areas": [
                {
                    "points": [
                        {"x": 0, "y": 0},
                        {"x": 100, "y": 0},
                        {"x": 100, "y": 100},
                        {"x": 0, "y": 100}
                    ],
                    "mode": "include"
                }
            ],
            "exclude_areas": []
        }
        
        response = api_client.post(f"{base_url}/api/count", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "count" in data
        assert "objects" in data
        assert isinstance(data["count"], int)
        assert isinstance(data["objects"], list)
        
        # Verify objects structure
        if len(data["objects"]) > 0:
            obj = data["objects"][0]
            assert "id" in obj
            assert "x" in obj
            assert "y" in obj
            assert isinstance(obj["x"], (int, float))
            assert isinstance(obj["y"], (int, float))
    
    def test_count_endpoint_with_exclude_area(self, api_client, base_url):
        """Test POST /api/count with both include and exclude areas"""
        image_b64 = create_test_image_base64()
        
        payload = {
            "image_base64": image_b64,
            "category": "tubi_tondi",
            "include_areas": [
                {
                    "points": [
                        {"x": 0, "y": 0},
                        {"x": 100, "y": 0},
                        {"x": 100, "y": 100},
                        {"x": 0, "y": 100}
                    ],
                    "mode": "include"
                }
            ],
            "exclude_areas": [
                {
                    "points": [
                        {"x": 60, "y": 60},
                        {"x": 100, "y": 60},
                        {"x": 100, "y": 100},
                        {"x": 60, "y": 100}
                    ],
                    "mode": "exclude"
                }
            ]
        }
        
        response = api_client.post(f"{base_url}/api/count", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert "count" in data
        assert "objects" in data
    
    def test_count_endpoint_different_categories(self, api_client, base_url):
        """Test different category types"""
        image_b64 = create_test_image_base64()
        
        categories = [
            "barre_quadre",
            "barre_rettangolari",
            "profili_l",
            "travi_ipe"
        ]
        
        for category in categories:
            payload = {
                "image_base64": image_b64,
                "category": category,
                "include_areas": [
                    {
                        "points": [
                            {"x": 0, "y": 0},
                            {"x": 100, "y": 0},
                            {"x": 100, "y": 100},
                            {"x": 0, "y": 100}
                        ],
                        "mode": "include"
                    }
                ],
                "exclude_areas": []
            }
            
            response = api_client.post(f"{base_url}/api/count", json=payload)
            assert response.status_code == 200, f"Failed for category: {category}"
            
            data = response.json()
            assert "count" in data
            assert "objects" in data
