import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.api.deps import admin_guard, get_db, UserInfo
import uuid

# Create a mock user info
mock_admin_user = UserInfo(
    id=uuid.uuid4(),
    email="admin@example.com"
)

# Mock admin guard
async def mock_admin_guard():
    return mock_admin_user

app.dependency_overrides[admin_guard] = mock_admin_guard

client = TestClient(app)

def test_get_billing():
    response = client.get("/api/admin/billing")
    assert response.status_code == 200
    data = response.json()
    assert "metrics" in data
    assert "revenueChart" in data
    assert "recentTransactions" in data
    assert "subscriptions" in data

def test_get_feedback():
    response = client.get("/api/admin/feedback")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)

def test_get_audit():
    response = client.get("/api/admin/audit?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert "rows" in data
    assert isinstance(data["rows"], list)

def test_post_audit_log():
    payload = {
        "event": "login",
        "email": "test@example.com",
        "success": True,
        "device": "Test Device"
    }
    # This route might not require admin_guard, but it uses get_current_user or similar?
    # Actually, audit POST just records the log.
    response = client.post("/api/admin/audit", json=payload)
    assert response.status_code == 200
    assert response.json().get("success") is True
