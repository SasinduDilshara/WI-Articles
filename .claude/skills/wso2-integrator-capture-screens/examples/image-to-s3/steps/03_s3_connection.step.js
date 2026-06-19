await addConnectorConnection("S3", "s3Client", {
  accessKeyId: '"YOUR_ACCESS_KEY_ID"',
  secretAccessKey: '"YOUR_SECRET_ACCESS_KEY"',
  region: '"ap-southeast-1"'
})
log('4. S3 connection')
