await addConnectorOperationNode(null, "s3Client", "Create Object")
await fillNodeForm({
  "Bucket Name": "wso2iqa",
  "Object Name": {expr: 'string `uploads/${name}`'},
  "File Content": {expr: 'payload'}
})
log('5. createObject saved')
