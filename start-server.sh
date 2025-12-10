#!/bin/bash

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Start the server
cd server
node index.js
