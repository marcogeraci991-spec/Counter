"""
Backend API tests for real image counting
Tests: Real steel bar image counting with include/exclude areas
"""
import pytest
import requests
import base64
import os


class TestRealImageCounting:
    """Test counting with real industrial object image"""
    
    def test_count_real_steel_bars_image(self, api_client, base_url):
        """Test counting with real Barre_Tonde_1.jpg image - should detect ~25-35 bars, NOT 1000+"""
        # Download real test image
        image_url = "https://customer-assets.emergentagent.com/job_steel-counter/artifacts/64tjuub2_Barre_Tonde_1.jpg"
        
        try:
            img_response = requests.get(image_url, timeout=10)
            assert img_response.status_code == 200, f"Failed to download test image: {img_response.status_code}"
            
            # Encode to base64
            image_b64 = base64.b64encode(img_response.content).decode()
            
            # Include area covering the bars area (~5% to 95% x, 5% to 75% y)
            payload = {
                "image_base64": image_b64,
                "category": "barre_tonde",
                "include_areas": [
                    {
                        "points": [
                            {"x": 5, "y": 5},
                            {"x": 95, "y": 5},
                            {"x": 95, "y": 75},
                            {"x": 5, "y": 75}
                        ],
                        "mode": "include"
                    }
                ],
                "exclude_areas": []
            }
            
            response = api_client.post(f"{base_url}/api/count", json=payload)
            assert response.status_code == 200, f"Count API failed: {response.status_code}"
            
            data = response.json()
            assert "count" in data
            assert "objects" in data
            
            count = data["count"]
            print(f"✓ Real image count: {count} objects detected")
            
            # CRITICAL: Should detect approximately 25-35 round bars, NOT 1000+
            assert 20 <= count <= 40, f"Count out of expected range: {count} (expected 25-35)"
            
            # Verify objects structure
            assert len(data["objects"]) == count
            if count > 0:
                obj = data["objects"][0]
                assert "id" in obj
                assert "x" in obj
                assert "y" in obj
                assert isinstance(obj["x"], (int, float))
                assert isinstance(obj["y"], (int, float))
            
            print(f"✓ PASS: Detected {count} bars (expected range: 25-35)")
            
        except requests.exceptions.RequestException as e:
            pytest.skip(f"Could not download test image: {e}")
    
    def test_count_with_exclude_area_reduces_count(self, api_client, base_url):
        """Test that exclude areas REDUCE the count when overlapping with include areas"""
        # Download real test image
        image_url = "https://customer-assets.emergentagent.com/job_steel-counter/artifacts/64tjuub2_Barre_Tonde_1.jpg"
        
        try:
            img_response = requests.get(image_url, timeout=10)
            assert img_response.status_code == 200
            image_b64 = base64.b64encode(img_response.content).decode()
            
            # First: Count with full include area
            payload_full = {
                "image_base64": image_b64,
                "category": "barre_tonde",
                "include_areas": [
                    {
                        "points": [
                            {"x": 5, "y": 5},
                            {"x": 95, "y": 5},
                            {"x": 95, "y": 75},
                            {"x": 5, "y": 75}
                        ],
                        "mode": "include"
                    }
                ],
                "exclude_areas": []
            }
            
            response_full = api_client.post(f"{base_url}/api/count", json=payload_full)
            assert response_full.status_code == 200
            count_full = response_full.json()["count"]
            print(f"✓ Full area count: {count_full} objects")
            
            # Second: Count with exclude area in top-right quadrant
            payload_exclude = {
                "image_base64": image_b64,
                "category": "barre_tonde",
                "include_areas": [
                    {
                        "points": [
                            {"x": 5, "y": 5},
                            {"x": 95, "y": 5},
                            {"x": 95, "y": 75},
                            {"x": 5, "y": 75}
                        ],
                        "mode": "include"
                    }
                ],
                "exclude_areas": [
                    {
                        "points": [
                            {"x": 50, "y": 5},
                            {"x": 95, "y": 5},
                            {"x": 95, "y": 40},
                            {"x": 50, "y": 40}
                        ],
                        "mode": "exclude"
                    }
                ]
            }
            
            response_exclude = api_client.post(f"{base_url}/api/count", json=payload_exclude)
            assert response_exclude.status_code == 200
            count_exclude = response_exclude.json()["count"]
            print(f"✓ With exclude area count: {count_exclude} objects")
            
            # CRITICAL: Exclude area should REDUCE the count
            assert count_exclude < count_full, f"Exclude area did not reduce count: {count_exclude} >= {count_full}"
            
            # Should reduce by at least a few objects (rough estimate: ~20-40% reduction)
            reduction = count_full - count_exclude
            assert reduction >= 3, f"Exclude area reduction too small: {reduction} objects"
            
            print(f"✓ PASS: Exclude area reduced count by {reduction} objects ({count_full} → {count_exclude})")
            
        except requests.exceptions.RequestException as e:
            pytest.skip(f"Could not download test image: {e}")
