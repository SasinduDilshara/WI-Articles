const integrationName = 'ImageUploader'
const projectName = 'S3Upload'

// Clean slate — remove project dir from any previous run
const projectDir = process.env.HOME + '/wso2integrator/' + projectName.toLowerCase()
try { fs.rmSync(projectDir, {recursive: true}); } catch {}

sayInit()

try {

say("Hello everyone, in this tutorial we are going to use WSO2 Integrator to create an integration that receives an image via HTTP POST and uploads it to Amazon S3.")
await waitForSay()

// --- Create project and integration ---

say("Let's start by creating a new project. I'll click Create on the welcome screen.")
await waitForGuest()
try { await window.frames()[0].getByRole("button", {name: "Skip for now"}).click() } catch {}
await guestClick(guestFrame.getByText('Create', {exact: true}).first())
await waitForText('Integration Name')
await waitForSay()

say("I'll name the integration ImageUploader and the project S3Upload.")
await guestFill(guestFrame.getByRole('textbox', {name: /Integration Name/i}), integrationName)
await guestFill(guestFrame.getByRole('textbox', {name: /Project Name/i}), projectName)
await waitForSay()

say("Now I'll click Create Integration.")
await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Create Integration'}))
// VS Code reloads into the new workspace — window goes stale
await window.waitForTimeout(5000).catch(() => {})
await ensureWindow()
await waitForGuest()
await waitForSay()

say("The workspace has loaded. I can see the project page with our integration listed. Let me click into it.")
await waitForText(integrationName)
{
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    await ensureWindow()
    await waitForGuest()
    await guestFrame.getByText(integrationName).evaluate(el => el.click()).catch(() => {})
    if (await waitForText('Design', 10000).catch(() => null)) break
  }
}
await waitForSay()

// --- Add HTTP service with POST resource ---

say("Now I'll add an artifact. I'll click Add Artifact to see what's available.")
await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Add Artifact'}))
await waitForText('HTTP Service')
await waitForSay()

say("There are several categories here — Automation, AI Integration, Event Integration, and more. For our use case, we want Integration as API. I'll select HTTP Service since we need an HTTP endpoint to receive image uploads.")
await window.waitForTimeout(2000)
await guestClick(guestFrame.getByText('HTTP Service').last())
await waitForText('Service Base Path')
await waitForSay()

say("I'll keep the default base path and click Create.")
await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Create'}))
await waitForText('Add Resource')
await waitForSay()

say("Time to add a resource. I'll pick POST as the HTTP method and set the path to upload.")
await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Add Resource'}))
await waitForGuest()
await guestFrame.getByText('POST', {exact: true}).evaluate(el => el.click())
await waitForText('Resource Path')
await guestFill(guestFrame.getByRole('textbox', {name: /Resource Path/i}), 'upload')
await waitForSay()

say("I'll save the resource. This takes us into the flow editor where we design the logic.")
await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Save'}))
await waitForText('Flow Sequence')
await waitForSay()

// --- Configure resource: payload type + query param ---

say("Before adding any logic, I need to configure the resource. Let me open the configuration panel.")
await guestClick(guestFrame.getByText('Configure', {exact: false}).first())
await waitForText('Resource Configuration')
await waitForSay()

say("Since we're receiving binary image data, I need to set the payload type. I'll click Define Payload.")
await guestClick(guestFrame.getByText('Define Payload', {exact: true}).first())
await window.waitForTimeout(500)
await waitForSay()

say("I'll browse the existing types to find the right one.")
await guestClick(guestFrame.getByText('Browse Existing Types', {exact: true}).first())
await window.waitForTimeout(500)
await waitForSay()

say("I need byte array — that's the correct type for raw binary content like images. Let me scroll down to Structural Types and select it.")
await window.waitForTimeout(1000)
// Scroll Structural Types heading into view first
await guestFrame.evaluate(() => {
  const headings = [...document.querySelectorAll('h5')]
  const h = headings.find(h => h.textContent.trim() === 'Structural Types')
  if (h) h.scrollIntoView({behavior: 'smooth', block: 'start'})
})
await window.waitForTimeout(2000)
// Now click byte[]
await guestFrame.evaluate((t) => {
  const ps = [...document.querySelectorAll('p')]
  const match = ps.find(p => p.textContent.trim() === t)
  if (!match) throw new Error(`Type "${t}" not found`)
  match.click()
}, 'byte[]')
await window.waitForTimeout(1000)
await waitForSay()

say("byte array is selected. I'll save the payload definition.")
await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Save'}).last())
await window.waitForTimeout(1000)
await waitForSay()

say("Now I'll add a query parameter called name. The caller will use this to specify the filename for the S3 object.")
await guestClick(guestFrame.getByText('Query Parameter', {exact: true}).first())
await window.waitForTimeout(500)
await guestFill(guestFrame.getByRole('textbox', {name: /Name/}).first(), 'name')
await window.waitForTimeout(300)
await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Save'}).first())
await waitForText('string name', 10000)
await waitForSay()

say("Now I'll save the overall resource configuration.")
await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Save'}).first())
{
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (!await guestFrame.getByText('Saving...').isVisible().catch(() => false)) break
    await window.waitForTimeout(300)
  }
}
await window.waitForTimeout(500)
await window.keyboard.press('Escape')
await window.waitForTimeout(500)
await waitForSay()

// --- Add S3 connection ---

say("Next, I need to set up a connection to Amazon S3. I'll click Add Connection in the node panel.")
const textBtn = guestFrame.getByText('Add Connection', {exact: true}).first()
if (await textBtn.isVisible().catch(() => false)) {
  await guestClick(textBtn)
} else {
  await ensureNodePanelOpen()
  await guestFrame.locator('.codicon-add').first().evaluate(el => el.closest('vscode-button').click())
}
await waitForText('Pre-built Connectors', 20000)
await waitForSay()

say("I'll search for the S3 connector and select it.")
await guestFill(guestFrame.getByPlaceholder('Search connectors...').first(), 'S3')
await window.waitForTimeout(500)
await guestFrame.evaluate((name) => {
  const ps = [...document.querySelectorAll('p')]
  const match = ps.find(p => p.textContent.trim() === name)
  if (!match) throw new Error(`Connector "${name}" not found`)
  match.closest('[class*="card"], [class*="item"], div')?.click() || match.click()
}, 'S3')
await waitForText('Connection Name', 30000)
await waitForSay()

say("Now I need to configure the AWS credentials. I'll click the config field to open the Record Configuration panel.")
{
  const hasCm = await guestFrame.evaluate(() => document.querySelectorAll('.cm-content').length)
  if (hasCm > 0) await guestFrame.locator('.cm-content').first().click()
  else await guestFrame.locator('textarea').first().click()
}
await window.waitForTimeout(2000)
await waitForText('Record Configuration', 10000)
await waitForSay()

say("I'll check the fields for access key, secret key, and region, then fill in the values. [jokingly] And before anyone pauses the video to grab these keys — don't worry, they're already deleted.")
await checkRecordFields(['accessKeyId', 'secretAccessKey', 'region'])
await window.waitForTimeout(1000)

const recordValue = '{\n    accessKeyId: "YOUR_ACCESS_KEY_ID",\n    secretAccessKey: "YOUR_SECRET_ACCESS_KEY",\n    region: "ap-southeast-1"\n}'
await cmFill(recordValue, 0)
await window.waitForTimeout(300)
await closeHelperPanel()
await waitForSay()

say("I'll minimize the record panel and name this connection s3Client.")
await guestFrame.evaluate(() => {
  const icon = document.querySelector('.fw-bi-minimize-modal')
  if (icon) icon.closest('button')?.click() || icon.click()
})
await window.waitForTimeout(500)
await guestFill(guestFrame.getByRole('textbox', {name: /Connection Name/i}), 's3Client')
await window.waitForTimeout(300)
await waitForSay()

say("Now I'll save the connection. This will also download the S3 connector dependency.")
await guestClick(guestFrame.locator('vscode-button').filter({hasText: 'Save Connection'}))
{
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if (!await guestFrame.locator('vscode-button').filter({hasText: 'Save Connection'}).isVisible().catch(() => false)) break
    await window.waitForTimeout(300)
  }
}
await window.waitForTimeout(500)
await waitForSay()

// --- Add Create Object operation ---

say("The S3 connector is ready. Now the node panel is asking which operation to use. I'll pick s3Client, then Create Object.")
await clickInNodePanel('s3Client')
await window.waitForTimeout(500)
await clickInNodePanel('Create Object')
await window.waitForTimeout(1000)
await waitForSay()

say("Here's the operation form. I'll set the bucket name to wso2iqa.")
{
  let cmIdx
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const cmMap = await _getCMMap(['Bucket Name'])
    cmIdx = cmMap['Bucket Name']
    if (cmIdx !== undefined) break
    await window.waitForTimeout(300)
  }
  await cmFill('wso2iqa', cmIdx)
  await window.waitForTimeout(100)
  await closeHelperPanel()
}
await waitForSay()

say("For the Object Name, I'll switch to Expression mode and use a string template that includes the name query parameter.")
await _toggleFieldToExpression('Object Name')
{
  const cmMap = await _getCMMap(['Object Name'])
  await cmFill('string `uploads/${name}`', cmMap['Object Name'])
  await window.waitForTimeout(100)
  await closeHelperPanel()
}
await waitForSay()

say("Same for File Content — I'll switch to Expression mode and set it to payload, which is the raw binary request body.")
await _toggleFieldToExpression('File Content')
{
  const cmMap = await _getCMMap(['File Content'])
  await cmFill('payload', cmMap['File Content'])
  await window.waitForTimeout(100)
  await closeHelperPanel()
}
await waitForSay()

say("Let me save the operation.")
await blurAllCM()
await saveNodeForm()
{
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if ((await listAddButtons().catch(() => [])).length > 0) break
    await window.waitForTimeout(300)
  }
}
await waitForSay()

// --- Add return ---

say("Almost done with the flow. I need to add a Return node that sends back the S3 key as JSON.")
const btnId = await getLastDoBlockButtonId()
await clickAddButton(btnId)
await waitForText('Statement')
await guestFrame.getByText('Return', {exact: true}).last().evaluate(el => el.click())
await waitForText('Expression')
await waitForSay()

say("I'll type the return expression — a JSON object with the key field pointing to the uploaded path.")
await cmFill('{key: string `uploads/${name}`}', 0)
await guestFrame.evaluate(() => document.querySelector('.cm-content')?.dispatchEvent(new Event('focusout', {bubbles:true})))
await window.waitForTimeout(200)
await guestFrame.locator('vscode-button').filter({hasText: 'Save'}).evaluate(el => el.click())
await waitForGuest()
await window.waitForTimeout(500)
await waitForSay()

// --- Run and verify ---

say("The integration is complete. Let me navigate back to the overview and run it.")
await navigateToIntegrationOverview(integrationName)
await waitForSay()

const endpoint = 'http://localhost:9090/upload'
const imgFile = process.cwd() + '/examples/image-to-s3/sample-img.jpg'
const postOpts = {method: 'POST', bodyFile: imgFile, headers: {'Content-Type': 'application/octet-stream'}}

say("I'll click Run and wait for the service to start.")
await runAndWaitForEndpoint(endpoint + '?name=warmup.jpg', 60000, postOpts)
await waitForSay()

say("Service is up. Let me open a terminal and upload a sample image so you can see it in action.")
await openNewTerminal()
await waitForSay()

const curlCmd = `curl -s -X POST -H "Content-Type: application/octet-stream" --data-binary @${imgFile} "${endpoint}?name=sample-img.jpg"`
say("I'll post our sample image to the upload endpoint with the name sample-img.jpg.")
await terminalRun(curlCmd)
await window.waitForTimeout(3000)
await waitForSay()

say("The response shows the image was uploaded to S3 under uploads/sample-img.jpg. Let me also verify the object exists in S3 using the AWS CLI.")
const awsCmd = 'aws --profile eggplant s3 ls s3://wso2iqa/uploads/sample-img.jpg'
await terminalRun(awsCmd)
await window.waitForTimeout(5000)
await waitForSay()

say("And there it is — the image is confirmed in S3. We've built a complete image upload pipeline with WSO2 Integrator. Thanks for watching!")
await window.waitForTimeout(3000)
await waitForSay()

const curlResult = exec(curlCmd)
const awsResult = exec(awsCmd)
return JSON.stringify({integrationName, curlResult, awsResult, sayLog: sayDump()})

} catch (e) {
  stopSay()
  throw e
}
