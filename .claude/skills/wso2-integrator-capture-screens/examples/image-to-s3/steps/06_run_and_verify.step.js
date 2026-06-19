await navigateToIntegrationOverview(integrationName)
log('7. on overview')

const endpoint = 'http://localhost:9090/upload'
const imgFile = process.cwd() + '/examples/image-to-s3/sample-img.jpg'
const postOpts = {method: 'POST', bodyFile: imgFile, headers: {'Content-Type': 'application/octet-stream'}}

await runAndWaitForEndpoint(endpoint + '?name=warmup.jpg', 60000, postOpts)
log('8. service is up')

// Upload image and verify via VS Code terminal
await openNewTerminal()
const curlCmd = `curl -s -X POST -H "Content-Type: application/octet-stream" --data-binary @${imgFile} "${endpoint}?name=sample-img.jpg"`
await terminalRun(curlCmd)
await window.waitForTimeout(3000)

const curlResult = exec(curlCmd)
log('9. curl: ' + curlResult)
const curlOk = curlResult.includes('"key":"uploads/sample-img.jpg"')
if (!curlOk) throw new Error('Expected key uploads/sample-img.jpg in curl response')

// Confirm object landed in S3
const awsCmd = 'aws --profile eggplant s3 ls s3://wso2iqa/uploads/sample-img.jpg'
await terminalRun(awsCmd)
await window.waitForTimeout(5000)

const awsResult = exec(awsCmd)
log('10. aws s3 ls: ' + awsResult)
const s3Ok = awsResult.includes('sample-img.jpg')
if (!s3Ok) throw new Error('sample-img.jpg not found in S3')

return JSON.stringify({integrationName, elapsed: Date.now()-t0, curlVerified: curlOk, s3Verified: s3Ok})
