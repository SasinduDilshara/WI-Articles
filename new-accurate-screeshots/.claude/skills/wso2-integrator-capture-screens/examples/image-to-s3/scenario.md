Receive a file via HTTP POST with a query parameter `name` (e.g. `?name=photo.png`), PUT it to an S3 bucket under key `uploads/<name>`, and return `{"key":"uploads/<name>"}` as JSON.
