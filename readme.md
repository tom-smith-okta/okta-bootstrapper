# Okta Bootstrapper

The Okta tenant bootstrapper is a "labs" project that was designed to facilitate creating a standard setup in an Okta tenant - specifically for API Access Management (OAuth as a Service) use-cases. It should be applicable in other contexts as well, but it also should be considered beta. Pull requests are welcome!

The Okta tenant bootstrapper allows you to create Okta objects (users, groups, apps, etc.) in your Okta tenant in an automated way. This tool takes an approach similar to tools like Terraform, but it is more geared toward SaaS (specifically Okta) and works natively in Node.

## How it works - the basic flow

input.json -> processing -> output.json

The idea is to create a bunch of Okta objects in a systematic, predictable way. The output.json file can then be consumed by an application interested in interacting with the Okta objects.

### Input
The bootstrapper engine consumes an input file in standard json format. This input file describes the Okta objects that you want to create.

The basic syntax for loading a bootstrap input file is:

```javascript
node index.js --test
```

where the file

/okta_bootstrap/input/test.json

is the input file you want to work with.

### Processing
Processing happens in two main phases. First, the bootstrapper loops through all of the objects in the input object and looks for any objects that do not have a default value. For any objects that do not have a default value, the user is prompted to supply a value via the command line.

After this initial pass, we know that we have default values available for all of the objects. So, for the second pass, we can give the user the option of auto-creating all remaining values.

So, in the second pass through the objects, the bootstrapper will prompt the user to:

1. accept the default value
2. provide a new value
3. accept all values and auto-create.

#### Notes
* All values in the input object are considered required.
* If there is a dependency between two values (more on this below), the required value must come first in the input file. The script is not smart enough (yet) to calculate dependencies out of order.

### Output
Each object in the input file has an attribute "saveToOutput". When this attribute is true, the engine will save the json object returned from Okta to an output file. This output file can then be used as an input file for a web application, for example.

#### Notes
Every output file is saved to the output folder:
{{project}}/okta_bootstrap/output

Every output file is named with the datestamp value, and then copied to 

/okta_bootstrap/output/{{image_name}}.json

So, the output/{{image_name}}.json file always contains the latest output, and previous builds are stored with their TAG name.

## How it works - making things more interesting

### Object types
There are three main object types allowed in the input file: strings, json objects, and data. Strings are generally values that are required to build a json object, and json objects are objects that are sent to the Okta API to create an object in Okta. A data object is a reference to a bootstrap output file.

### Variables
The Okta bootstrapper allows variables in the input object. A simple example is that I want to add a new user to a new group. But, before runtime, I don't know the Okta id of the group because I haven't created it yet.

Variables are indicated in objects with the following syntax:

"email": "{{EMAIL}}"

in this example, we've indicated that the email property (of a larger json object) should be supplied by another object with the name {{EMAIL}}

When the bootstrapper engine reaches a property definition that includes a variable, it will:
1. Look in the environment (process.env.EMAIL) to see if a value has been defined for that property. If it finds that a value has been defined in the environment, then it will suggest using that value.
2. Look in the input object to see if there is an object with that name. If it finds an object with that name, then it will look for a default value for that property, and suggest using it.
3. If the engine does not find the value defined in either of those places, and the value type is string, it will ask the user to supply a value, and then store it as an environment variable.

#### Notes
* The bootstrapper will only look for strings in process.env, not json objects

### Advanced variables
In addition to the basic type of variable indicated by {{EMAIL}}, the bootstrapper supports two advanced types of variables:

#### Object properties
You can refer to a property of another object like this:

{{OKTA_GROUP_01.id}}

This indicates that I want to use the id attribute of the OKTA_GROUP_01 object (which is calculated at runtime). When the bootstrapper creates an Okta object, it stores the returned json in a "staging" object, so that the objects can be referred to during runtime regardless of whether they are saved to output.

As of this writing, the bootstrapper supports only 1st level attributes: OKTA_GROUP_01.id is OK; OKTA_GROUP_01.profile.name is not.

Note: it can be convenient for an outside consuming application to have direct, top-level access to a value that is deeper in the output object. In other words, a consuming application might want a value for client_id, but in the output file this value is stored as CLIENT.client_id. The solution for this (at least for now) is to add another object in the input file that "promotes" this value to the top level:

"OKTA_CLIENT_ID": {
	"saveToOutput": true,
	"objType": "string",
	"default": "{{OKTA_CLIENT.client_id}}"
}

#### Generated values
There is a special kind of variable in the Okta bootstrapper that generates arbitrary values automatically. The most basic example of this is the TAG value. Every time you run the bootstrapper against an input file, any object (where possible) that you create is tagged with the value of TAG, and the output file includes this tag as well.

The TAG concept has a few purposes:
1. In your Okta tenant, you should be able to see which objects were created by the bootstrapper engine.
2. For a given execution of Okta bootstrapper, you should be able to tell which objects were created.
3. Naturally, many objects in Okta require a unique name - such as group. By appending a tag to the group name, you can run the bootstrapper multiple times without having to worry about name collisions. (But you also can potentially get a lot of bogus objects in your tenant. This design decision is up for debate.)

So, the TAG value is always automatically generated with every run of the engine, and is added where possible to Okta objects that are created.

This special variable is indicated with the GENERATE keyword:

"TAG": {
	"desc": "a unique string to help identify objects created by this bootstrap session",
	"saveToOutput": true,
	"default": "{{GENERATE_TAG}}",
	"objType": "string"
}

After this definition, the TAG value can be referenced with {{TAG}}

#### Other automatically generated values
As of this writing, three other kinds of strings can be automatically generated. To facilitate the production of arbitrary users, you can use

{{GENERATE_LASTNAME}}
{{GENERATE_FIRSTNAME}}
Using this will not guarantee a unique username (vs. existing usernames in your tenant), but it will help. Obviously, the chances of a collision increase with the number of existing and generated users.

{{GENERATE_PASSWORD}}
Using this will guarantee a valid password that adheres to the default Okta password requirements.

## Getting Started, Prerequisites
The only prerequisite for running the bootstrapper is to have an Okta tenant and an API token for that tenant.

If you don't have an Okta tenant yet, you can get one free at [developer.okta.com](https://developer.okta.com/signup/)

To get an API token for your tenant, you can follow the instructions [here](https://developer.okta.com/docs/api/getting_started/getting_a_token)

To supply your Okta tenant and API key to bootstrapper, you can:
1. put them in your environment variables
2. put them in the .env file

A couple of sample input files - designed to build a group of objects for Okta's API Access Management - is included in the repo. You can either just run this file or build your own.

## The input file schema
The input file has this basic structure:

{
	"NAME_OF_OBJECT_1": {
		"property1": "value1",
		"propertyN": "valueN"
	},
	"NAME_OF_OBJECT_N":
		"property1": "value1",
		"propertyN": "valueN"
	}
}

Name of Object: an arbitrary name for the object that you are creating, or the string that you want to store.

### Properties
The following properties are supported. Except as indicated, all should be considered required (though the error checking is not yet mature enough to enforce this).

Extraneous properties will be ignored.

comment
* type: string
* required: no
* desc: an internal-only description of the field. Basically a way to include comments in the input json object. Note that *hints* are displayed to the end user in the command line; *comments* are ignored by the engine.

default
* type: string (where objType == "string"), json object (where objType == "json")
* required: no
* desc: a default value for this object. For Okta objects, this should be the body of the API request.
* example:
This is an example of a default value for an Okta group:

"OKTA_GROUP_01": {
	"default": {
		"profile": {
			"name": "solar_system_users {{TAG}}",
			"description": "All solar system users"
		}
	}
	...
}

groups
* type: json array
* required: only applicable to objectClass okta:client. Strongly encouraged for okta:client
* desc: this is the list of group ids that a client will be assigned to. By default in Okta, when a client is created, it is not assigned to any groups or users.
* example:

"OKTA_CLIENT": {
	"groups": [
		"{{OKTA_GROUP_01.id}}",
		"{{OKTA_GROUP_02.id}}",
		"{{OKTA_GROUP_03.id}}"
	]
	...
}

hint
* type: string
* required: no
* desc: a string to give the end-user instructions about supplying a value for this property
* allowed values: string
* example:
	"hint": "please enter in this format: https://dev-123456.oktapreview.com"

IDfieldName
* type: string
* required: only for objectClass == "okta:client"
* desc: All Okta objects have an "id" field, with the exception of Clients, whose id field is called "client_id".
* allowed values: "id" || "client_id"

objectClass
* type: string
* required: yes, where objType == json
* allowed values: "okta:authz_server", "okta:client", "okta:oauth_policy", "okta:rule", "okta:scope", "okta:user", "okta:user_group"
* desc: this indicates the type of Okta object being created. A future build should collapse this field with the objType field.

objType
* type: string
* required: yes
* allowed values: "string" || "json" || "data"
* desc: is this object a simple string, a json object that will create an Okta object, or another bootstrap output file?

oktaEndpoint
* type: string
* required: yes, where objectClass is not "okta:user" or "okta:user_group" (these requests are handled by the sdk so the url is known)
* desc: the path to the api endpoint to create this object. In the future, this property should probably be abstracted away into a template. But note that it also supports variables in the path: /api/v1/authorizationServers/{{OKTA_AUTHORIZATION_SERVER.id}}/scopes
* example:
/oauth2/v1/clients

saveToOutput
* type: boolean
* required: yes
* desc: should this value be saved to the output file? For strings, a key-value-pair is stored. For Okta objects, the json object returned from Okta is stored.

Supported Okta objects
* Authorization servers
* Clients
* Groups
* OAuth policies
* OAuth rules
* OAuth scopes
* Users