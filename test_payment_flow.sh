#!/bin/bash
# Payment Flow Test Script
BASE_URL="http://localhost:5000/api"
TOKEN=""

echo "=========================================="
echo "NURU FOUNDATION - PAYMENT FLOW TEST"
echo "=========================================="

# Step 1: Login as test student
echo -e "\n[1] Logging in as student..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "student@test.com", "password": "password123"}' 2>&1)

if echo "$LOGIN_RESPONSE" | grep -q '"token"'; then
    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo "✓ Login successful"
    echo "  Token: ${TOKEN:0:30}..."
else
    echo "✗ Login failed:"
    echo "$LOGIN_RESPONSE" | head -5
    exit 1
fi

# Step 2: Get student invoices
echo -e "\n[2] Fetching student invoices..."
INVOICES=$(curl -s -X GET "$BASE_URL/student/invoices" \
  -H "Authorization: Bearer $TOKEN")
echo "$INVOICES" | grep -E '"status"|"amount"|"id"' | head -10

# Step 3: Check notes access (should be denied)
echo -e "\n[3] Checking notes access (course ID 1)..."
ACCESS=$(curl -s -X GET "$BASE_URL/student/course-notes-access/1" \
  -H "Authorization: Bearer $TOKEN")
echo "$ACCESS" | grep -E '"access"|"reason"|"invoice"'

if echo "$ACCESS" | grep -q '"access": false'; then
    echo "✓ Notes access correctly denied"
    INVOICE_ID=$(echo "$ACCESS" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
else
    echo "✗ Notes access check failed"
fi

# Step 4: Test course slug endpoint
echo -e "\n[4] Testing course slug resolution..."
SLUG=$(curl -s -X GET "$BASE_URL/courses/slug/python")
echo "$SLUG" | grep -E '"success"|"slug"|"title"'

# Step 5: Initiate payment (simulation mode)
if [ -n "$INVOICE_ID" ]; then
    echo -e "\n[5] Initiating M-Pesa payment (simulation)..."
    PAYMENT=$(curl -s -X POST "$BASE_URL/student/pay/$INVOICE_ID" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"phoneNumber": "254712345678"}')
    echo "$PAYMENT" | grep -E '"success"|"message"|"checkoutRequestId"'
fi

# Step 6: Check auth middleware (locked user)
echo -e "\n[6] Testing auth middleware with locked user..."
LOCKED_RESPONSE=$(curl -s -X GET "$BASE_URL/student/courses" \
  -H "Authorization: Bearer $TOKEN")
echo "$LOCKED_RESPONSE" | grep -E '"error"|"locked"' | head -3

echo -e "\n=========================================="
echo "TEST COMPLETE"
echo "=========================================="
