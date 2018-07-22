/********************************
// Okta Bootstrap
*/

var dotenv = require('dotenv')

const result = dotenv.config()

if (result.error) {
	console.log("Warning: cannot find a .env file")
}

var fs = require("fs")
const okta = require("@okta/okta-sdk-nodejs")
var promptly = require("promptly")
var request = require("request")

const utils = require("./utils.js")

/************************************************************/
// PATHS
var workingDir = "./okta_bootstrap/"

var inputDir = workingDir + "input/"

var outputDir = workingDir + "output/"

/***********************************************************/
// GLOBAL OBJECTS

process.env.DATE_STAMP = utils.get_date_stamp()

var inputObj = {}       // input template loads here
var stagingObj = {}     // json objects are stored here before being sent to okta API
var outputObj = {}      // optionally store output values

var autogen = false     // should the script just run w/o user review?
                        // user can change this value at runtime

var okta_client         // use the Okta Node SDK when possible

/***********************************************************/

get_command_line_args()
.then((image_name) => {
	global.IMAGE_NAME = image_name
	global.INPUT_FILE_NAME = IMAGE_NAME + ".json"
	global.INPUT_FILE_PATH = inputDir + INPUT_FILE_NAME

	get_valid_json(INPUT_FILE_PATH, INPUT_FILE_PATH)
	.then((valid_json) => {

		inputObj = valid_json

		console.log("Found a valid input file at " + INPUT_FILE_PATH)

		get_creds()
		.then(() => {
			okta_client = new okta.Client({
				orgUrl: process.env.OKTA_TENANT,
				token: process.env.OKTA_API_TOKEN
			})

			get_all_vals()
			.then(() => {
				console.log("Finished processing values...")

				write_output_files()
				.then(() => {
					console.log("Finished.")
					process.exit()
				})
				.catch((errorMsg) => {
					console.log(errorMsg)
					process.exit()
				})
			})
			.catch((error) => {
				console.log(error)
				process.exit()
			})

		})
		.catch((error) => {
			console.log(error)
			process.exit()
		})
	})
	.catch((error) => {
		console.log(error)
		process.exit()
	})
})
.catch((error) => {
	if (error === "No input file supplied.") {
		console.log(error)
		console.log("Please supply an input file via the command line:")
		console.log("   node index.js --mulesoft")
		console.log("Or if you are using Okta bootstrap from a parent module:")
		console.log("   node okta_bootstrap.js --mulesoft")
	}
	else {
		console.log(error)
	}
	process.exit()
})

function assign_group_to_app(group_id, app_id) {

	return new Promise((resolve, reject) => {

		var url = process.env.OKTA_TENANT + "/api/v1/apps/" + app_id + "/groups/" + group_id

		var options = {
			method: 'PUT',
			url: url,
			headers: {
				'Cache-Control': 'no-cache',
				Authorization: 'SSWS ' + process.env.OKTA_API_TOKEN,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			json: true
		}

		request(options, function (error, response, body) {

			if (error) { reject(error) }

			else if (body.error) { reject (JSON.stringify(body)) }

			else { resolve("success") }
		})
	})
}

function assign_groups_to_app (key, app_id) {

	return new Promise(async(resolve, reject) => {

		var groups = inputObj[key].groups

		for (var i in inputObj[key].groups) {
			try {
				swap_out_placeholders(groups[i])
				.then((group_id) => assign_group_to_app(group_id, app_id))
			}
			catch(error) {
				reject(error)
			}
		}
		resolve("finished with assignment")
	})
}

function evaluate_user_response(response, key, val) {

	response = response.toString()
	response = response.toUpperCase()

	return new Promise((resolve, reject) => {

		if (response === "A") {
			autogen = true
			response = "C"
		}

		if (response === "P") {
			get_user_input_new_val(key, function (err) {
				if (err) { throw new Error(err) }
				resolve("done")
			})
		}
		else if (response === "Q") {
			process.exit()
		}
		else {
			if (inputObj[key].objType === "string") {
				set_val(key, val, function (err) {
					if (err) { throw new Error(err) }
					resolve("done")
				})
			}
			else if (inputObj[key].objType === "data") {
				resolve("done")
			}
			else {
				get_okta_val(key, stagingObj[key])
				.then((successMessage) => resolve("done"))
				.catch((rejectMessage) => reject(rejectMessage))
			}
		}
	})
}

function generate_val(valName, callback) {

	if (valName === "TAG") {

		var tag = "autogen" + process.env.DATE_STAMP

		return callback(null, tag)
	}

	if (valName === "FIRSTNAME") {
		var lastNames = require("./data/first_names.json")

		var r = Math.floor(Math.random() * lastNames.length)

		return callback(null, lastNames[r])
	}

	if (valName === "LASTNAME") {
		var lastNames = require("./data/last_names.json")

		var r = Math.floor(Math.random() * lastNames.length)

		return callback(null, lastNames[r])
	}

	if (valName === "PASSWORD") {
		var firstWord = ["big", "blue", "city", "cool", "data", "jump", "just", "lazy", "nice", "red", "real", "spot", "wild", "word"]

		var secondWord = ["Bear", "Bird", "Cat", "Deer", "Dog", "Eel", "Fly", "Fox", "Frog", "Goat", "Hawk", "Hen", "Pony", "Rat", "Sky"]

		var sp_chrs = ["!", "@", "#", "$", "%", "^", "&", "*"]

		var f = Math.floor(Math.random() * firstWord.length)
		var s = Math.floor(Math.random() * secondWord.length)
		var c = Math.floor(Math.random() * sp_chrs.length)
		var n = Math.floor(Math.random() * 9)

		var password = firstWord[f] + secondWord[s] + n + sp_chrs[c]

		return callback(null, password)
	}
	return callback("cannot generate a value for property" + valName)
}

function get_all_vals() {

	var msg

	return new Promise( async (resolve, reject) => {

		console.log("\nnow, reviewing all values...")
		for (key in inputObj) {
			msg = ""
			console.log("\nlooking for " + key + "...")

			if (process.env[key]) {
				if (key === "OKTA_API_TOKEN") { msg = "found OKTA_API_TOKEN in process.env" }
				else {
					msg += "the value " + process.env[key] + " is already stored in process.env"
					msg += "\n so we are skipping..."
				}
				console.log(msg)
			}
			else {
				msg += "cannot find a final value for " + key + " yet"
				msg += "\ncalculating/retrieving default value..."

				console.log(msg)

				var response
				var result

				if ("default" in inputObj[key]) {
					var val = await get_default_val(key)

					console.dir(val)

					response = await get_user_input("accept value", key)
					result = await evaluate_user_response(response, key, val)

				}
				else {
					console.log("no default value available.")
					response = await get_user_input("new val", key)

					set_val(key, response, function (err) {
						if (err) { reject(err) }
					})
				}
			}
		}
		resolve("done")
	})
}

function get_command_line_args() {
	return new Promise((resolve, reject) => {
		if (process.argv[2]) {
			var a = process.argv[2]

			var arr = a.split("--")

			var image_name = arr[1]

			resolve(image_name)
		}
		else {
			reject ("No input file supplied.")
		}
	})
}

function get_creds() {
	var msg = ""
	return new Promise(async(resolve, reject) => {
		if (process.env.OKTA_TENANT) {
			outputObj.OKTA_TENANT = process.env.OKTA_TENANT

			if (process.env.OKTA_API_TOKEN) {

				utils.okta_api_token_works()
				.then((success_msg) => resolve("works"))
				.catch((error) => reject("The Okta tenant + API token combo does not work."))

			}
			else { // could not find Okta API token in env
				msg += "Your Okta API token must be an environment variable."
				msg += "\nuse the format: https://dev-292102.oktapreview.com"

				reject(msg)
			}
		}
		else { // could not find Okta tenant name in env
			msg += "Your Okta tenant name must be an environment variable."
			msg += "\nuse the format: https://dev-292102.oktapreview.com"
			reject(msg)
		}
	})
}

function get_default_json(valName, callback) {
	try {
		var strVal = String(JSON.stringify(inputObj[valName].default))

		swap_out_placeholders(strVal)
		.then((newString) => { return callback(null, JSON.parse(newString))})
		.catch((error) => { return callback(error)})
	} catch (error) {
		return callback(error)
	}
}

function get_default_val(key) {

	return new Promise( async (resolve, reject) => {

		if (!(inputObj[key].objType === "string" || inputObj[key].objType === "json" || inputObj[key].objType === "data")) {
			reject("the key " + key + " does not have a valid objType defined.")
		}

		if (inputObj[key].objType === "string") {
			try {
				var val = swap_out_placeholders(inputObj[key].default)
				resolve(val)
			} catch(error) {
				reject(error)
			}
		}
		else if (inputObj[key].objType === "data") {

			var file_path = "./okta_bootstrap/output/" + inputObj[key].default + ".json"
			var data_json = await utils.get_bootstrap_file(file_path)
			var data = await utils.try_parse_json(data_json, file_path)

			stagingObj = Object.assign(stagingObj, data)

			resolve(stagingObj)

		}
		else {
			console.log("To get a new " + key + " we will send a request to Okta with the following body:")

			get_default_json(key, function(err, default_json) {

				if (err) { reject(err) }

				stagingObj[key] = default_json

				resolve(default_json)
			})
		}
	})
}

function get_no_defaults() {

	return new Promise( async(resolve, reject) => {

		console.log("\nlooking for strings without default values...")

		for (var key in inputObj) {

			if (!(inputObj[key].default) && !(process.env[key])) {

				try {
					var new_val = await get_user_input("new val", key)
					set_val(key, new_val, function(err){
						if (err) { reject(err) }
					})
				} catch(error) {
					reject(error)
				}
			}
		}
		resolve("done")
	})
}

function get_okta_val(valName, val) {

	return new Promise((resolve, reject) => {

		console.log("\nattempting to create " + valName + " on Okta...")

		console.log("the val is: ")

		console.dir(val)

		var objectClass = inputObj[valName].objectClass

		switch (objectClass) {

			case "okta:user_group":

				okta_client.createGroup(val)
				.then(group => {
					if ("id" in group) {
						if (group.id != "") {
							console.log("successfully created " + valName + ": " + group.id)
							console.log(group)
							set_val(valName, group, function(err){
								if (err) { reject(err) }
								else { resolve("done") }
							})
						}
						else { reject("something went wrong creating" + valName) }
					}
					else { reject("something went wrong creating" + valName) }
				})

				break

			case "okta:user":

				okta_client.createUser(val)
				.then(user => {
					if ("id" in user) {
						if (user.id != "") {
							console.log("successfully created " + valName + ": " + user.id)
							console.log(user)
							set_val(valName, user, function(err){
								if (err) {reject (err)}
								else { resolve ("done") }
							})
						}
						else { reject("something went wrong creating" + valName) }
					}
					else { reject("something went wrong creating" + valName) }
				})

				break

			default:

				get_url(valName, function(error, url) {
					if (error) { reject("error creating url") }

					var options = {
						method: 'POST',
						url: url,
						headers: {
							'Cache-Control': 'no-cache',
							Authorization: 'SSWS ' + process.env.OKTA_API_TOKEN,
							'Content-Type': 'application/json',
							Accept: 'application/json'
						},
						body: val,
						json: true
					}

					// sometimes the id of the okta object is not called "id"
					// but maybe only for "client_id"
					var IDfieldName = "id"
					if (inputObj[valName].IDfieldName) { IDfieldName = inputObj[valName].IDfieldName }

					request(options, function (error, response, body) {

						console.log("the body is: ")
						console.dir(body)
						if (error) { reject(error) }

						if (body.error) { reject (JSON.stringify(body)) }

						if (IDfieldName in body) {
							if (body[IDfieldName] != "") {
								console.log("successfully created " + valName + ": " + body[IDfieldName])
								console.log(body)
								set_val(valName, body, function(err){
									if (err) { reject(err) }
									else {

										if (inputObj[valName].objectClass === "okta:client" && inputObj[valName].groups) {

											assign_groups_to_app(valName, body[IDfieldName])
											.then((successMessage) => resolve("success"))
											.catch((rejectMessage) => reject(rejectMessage))

										}
										else { resolve("done")}
									}
								})
							}
							else { reject("something went wrong creating " + valName) }
						}
						else { reject("something went wrong creating " + valName) }
					})
				})
		}
	})
}

function get_url(key, callback) {

	var path = inputObj[key].oktaEndpoint

	swap_out_placeholders(path)
	.then((path) => { return callback(null, process.env.OKTA_TENANT + path)})
	.catch((error) => { return callback(error) } )
}

function get_user_input(context, key) {

	return new Promise( async(resolve, reject) => {

		var result
		var prompt = ""
		var def_val = ""

		if (context === "new val") {

			// this was originally set up to build all output into the prompt var
			// but the promptly plugin behaved erratically with long prompts,
			// which can happen when you have a long hint.

			console.log("Enter a value for " + key)
			console.log("or enter q to quit")

			if ("hint" in inputObj[key]) {
				console.log(inputObj[key].hint)
			}

			prompt += "\n" + key + ": "
		}
		else if (context === "ok to continue" || context === "accept value") {

			def_val = "C"

			prompt += "Do you want to:"

			if (context === "ok to continue") {
				prompt += "\n(C) continue - process the input file"
				prompt += "\n(i) ignore - continue without Okta bootstrap"
			}
			else if (context === "accept value") {
				prompt += "\n(C) continue with this value"

				if (inputObj[key].objType === "string") {
					prompt += "\n(p) provide a new value"
				}

				prompt += "\n(a) auto-accept and generate all remaining values"
			}
			prompt += "\n(q) quit"
			prompt += "\n:"
		}

		/**************************************/

		if (autogen === true) { result = "C" }
		else if (def_val === "") {
			try {
				result = await promptly.prompt(prompt)
			} catch(error) {
				reject(error)
			}
		}
		else {
			try {
				result = await promptly.prompt(prompt, {default: def_val})
			} catch(error) {
				reject(error)
			}
		}

		/**************************************/

		if (result === "Q" || result === "q") { process.exit() }

		else {
			resolve(result)
		}
	})
}

async function get_valid_json(file_path) {
	return new Promise(async (resolve, reject) => {
		try {
			var this_file = await utils.get_bootstrap_file(file_path)
			var valid_json = await utils.try_parse_json(this_file, file_path)

			resolve(valid_json)

		} catch (e) {
			reject(e)
		}
	})
}

function set_val(key, val, callback) {
	if (key === "OKTA_API_TOKEN") {}
	else {
		if (inputObj[key].saveToOutput) {
			outputObj[key] = val
		}
	}

	if (inputObj[key].objType != "json") { process.env[key] = val }

	return callback(null)
}

function swap_out_placeholders(thisString) {

	console.log("looking at string " + thisString)

	return new Promise((resolve, reject) => {

		// placeholder examples = {{GENERATE_PASSWORD}}, {{LASTNAME}}, {{OKTA_GROUP_01.id}}

		var placeholders = thisString.match(/{{\w*}}|{{\w*\.\w*}}/g)

		if (placeholders === null) {
			resolve(thisString)
		}

		for (var key in placeholders) {

			var placeholder = placeholders[key]

			// Get whatever is inside {{}}
			var p = placeholder.replace("{{", "")
			p = p.replace("}}", "")

			if (placeholder.includes(".")) { // OKTA_GROUP_01.id

				var a = p.split(".")

				var topLevelKey = a[0] // OKTA_GROUP_01

				var prop = a[1] // id

				thisString = thisString.replace(placeholder, outputObj[topLevelKey][prop])
			}
			else if (placeholder.includes("GENERATE")) {

				console.log("this is a generated value...")

				var a = p.split("_")
				var thisValName = a[1]

				generate_val(thisValName, function(err, val) {
					if (err) { reject(err) }

					process.env[thisValName] = val

					thisString = thisString.replace(placeholder, val)
				})
			}
			else {

				if (p in process.env) {
					console.log("found " + p + " in process.env")
					thisString = thisString.replace(placeholder, process.env[p])
				}
				else if (p in inputObj) {
					if ("default" in inputObj[p]) {
						thisString = thisString.replace(placeholder, inputObj[p].default)
					}
				}
				else if (p in stagingObj) {
					thisString = thisString.replace(placeholder, stagingObj[p])
				}
				else {
					reject("could not find a default value for " + placeholder)
				}
			}
		}
		resolve(thisString)
	})
}

function write_output_files() {
	return new Promise((resolve, reject) => {

		var newFileName = outputDir + process.env.DATE_STAMP + "_" + IMAGE_NAME + ".json"

		fs.writeFile(newFileName, JSON.stringify(outputObj, null, 2), "utf8", (err) => {

			if (err) reject(err)

			fs.copyFile(newFileName, outputDir + IMAGE_NAME + ".json", (err) => {
				if (err) reject(err)

				else { resolve("done") }
			})
		})
	})
}