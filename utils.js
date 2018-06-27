var fs = require("fs")
var request = require("request")

module.exports.okta_api_token_works = okta_api_token_works
module.exports.get_date_stamp = get_date_stamp
module.exports.try_parse_json = try_parse_json
module.exports.get_bootstrap_file = get_bootstrap_file

function okta_api_token_works() {
	// this api call is just a simple way to test an api token

	return new Promise((resolve, reject) => {

		var options = {
			method: 'GET',
			url: process.env.OKTA_TENANT + '/api/v1/meta/schemas/user/default',
			headers: {
				'Cache-Control': 'no-cache',
				Authorization: 'SSWS ' + process.env.OKTA_API_TOKEN,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			json: true
		}

		request(options, function (error, response, body) {
			console.log("sending a request to Okta to test the api token...")
			if (error) {
				console.log(error)
				reject()
			}

			else if (body.errorCode) {
				console.log(body.errorCode)
				reject()
			}
			else {
				console.log("the token works")
				resolve()
			}
		})
	})
}

function get_date_stamp() {
	// come up with a tag for this session to ensure that new
	// entities created are unique
	var datetime = new Date()
	var d = datetime.toJSON()
	var arr = d.split("T")
	var day = arr[0].replace(/-/g, "") // 20180312
	var x = arr[1].split(":")
	var DATE_STAMP = day + "-" + x[0] + x[1]

	return DATE_STAMP
}

function get_bootstrap_file(file_path) {
	return new Promise((resolve, reject) => {

		fs.readFile(file_path, (err, data) => {
			if (err) {
				reject("Could not find an Okta bootstrap input file at " + file_path)
			}
			else { resolve(data) }
		})
	})
}

function try_parse_json (jsonString, file_path){
	return new Promise((resolve, reject) => {

		try {
			var o = JSON.parse(jsonString)

			// Handle non-exception-throwing cases:
			// Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
			// but... JSON.parse(null) returns null, and typeof null === "object", 
			// so we must check for that, too. Thankfully, null is falsey, so this suffices:
			if (o && typeof o === "object") {
				resolve(o)
			}
		}
		catch (e) { reject("the file " + file_path + " is not valid json.") }
	})
}