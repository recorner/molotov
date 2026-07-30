#!/bin/bash

# Set the filename for publisher's checksums
PUBLISHER_CHECKSUMS="publisher_checksums.txt"

# Check if the publisher's checksums file exists
if [ ! -f "$PUBLISHER_CHECKSUMS" ]; then
  echo "Error: Publisher's checksums file not found."
  exit 1
fi

# Read the publisher's checksums file line by line
while read -r line; do
  # Extract the checksum and filename from each line
  checksum=$(echo "$line" | awk '{print $1}')
  filename=$(echo "$line" | awk '{print $2}')

  # Check if the local file exists
  if [ ! -f "$filename" ]; then
    echo "Error: File '$filename' not found."
    continue
  fi

  # Calculate the local file's checksum using md5sum (you can replace it with cksum or sha1sum if desired)
  local_checksum=$(md5 -q "$filename")

  # Compare the local checksum with the publisher's checksum
  if [ "$local_checksum" = "$checksum" ]; then
    echo "File '$filename' is up-to-date."
  else
    echo "Warning: File '$filename' is different from the publisher's version."
  fi
done < "$PUBLISHER_CHECKSUMS"
