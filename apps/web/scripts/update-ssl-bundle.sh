#!/bin/bash

# Script to update HAProxy SSL bundle after Let's Encrypt renewal
# This script should be called after certbot renews certificates

DOMAIN="untouch.live"
HAPROXY_DIR="/root/neo/haproxy"
BUNDLE_FILE="${HAPROXY_DIR}/bundle.pem"

# Check if certificates exist
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ] || [ ! -f "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" ]; then
    echo "Error: SSL certificates not found for ${DOMAIN}"
    exit 1
fi

# Create new bundle
echo "Updating SSL bundle for ${DOMAIN}..."
cat "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" > "${BUNDLE_FILE}"

# Set correct permissions
chmod 644 "${BUNDLE_FILE}"

echo "SSL bundle updated successfully at ${BUNDLE_FILE}"

# Restart HAProxy container if it's running
if docker ps --format "table {{.Names}}" | grep -q "neo-haproxy"; then
    echo "Restarting HAProxy container..."
    docker restart neo-haproxy
    echo "HAProxy restarted successfully"
fi
