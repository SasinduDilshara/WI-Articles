const t0 = Date.now()
const log = (msg) => console.log(`[${((Date.now()-t0)/1000).toFixed(1)}s] ${msg}`)

const {integrationName} = await createProjectAndIntegration("ImgS3")
log('1. project: ' + integrationName)

await createHttpServiceWithResource("POST", "upload")
log('2. HTTP POST /upload')
