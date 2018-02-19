/**
 * Copyright 2016 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the “License”);
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an “AS IS” BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// First add the obligatory web framework
var express = require('express');
var app = express();

var bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({
  extended: false
}));

// Util is handy to have around, so thats why that's here.
const util = require('util')
    // and so is assert
const assert = require('assert');

// We want to extract the port to publish our app on
var port = process.env.PORT || 8080;

// Then we'll pull in the database client library
const { Etcd3 } = require('etcd3');

// Now lets get cfenv and ask it to parse the environment variable
var cfenv = require('cfenv');

// load local VCAP configuration  and service credentials
var vcapLocal;
try {
  vcapLocal = require('./vcap-local.json');
  console.log("Loaded local VCAP", vcapLocal);
} catch (e) { 
  console.log(e)
}

const appEnvOpts = vcapLocal ? { vcap: vcapLocal} : {}

const appenv = cfenv.getAppEnv(appEnvOpts);

// var appenv = cfenv.getAppEnv();

// Within the application environment (appenv) there's a services object
var services = appenv.services;

// The services object is a map named by service so we extract the one for etcd
var etcd_services = services["compose-for-etcd"];

// This check ensures there is a services for etcd databases
assert(!util.isUndefined(etcd_services), "Must be bound to compose-for-etcd services");

// We now take the first bound etcd service and extract it's credentials object
var etcdCredentials = etcd_services[0].credentials;

// Within the credentials, an entry ca_certificate_base64 contains the SSL pinning key
// We convert that from a string into a Buffer entry in an array which we use when
// connecting.
var ca = new Buffer(etcdCredentials.ca_certificate_base64, 'base64');
var parts = etcdCredentials.uri_cli.split(" ");
var hosts = parts[2].substr('--endpoints='.length).split(",");
var userpass = parts[3].substr('--user='.length).split(":");
var auth = {
    username: userpass[0],
    password: userpass[1]
};

var opts = {
    hosts: hosts,
    auth: auth,
    ca: ca
};

var etcd = new Etcd3(opts).namespace("/example/words/");
// We can now set up our web server. First up we set it to serve static pages
app.use(express.static(__dirname + '/public'));

app.put("/words", function (request, response) {
  etcd.put(request.body.word).value(request.body.definition).then(
    (result) => {
      response.send(result);
    }
  ).catch((err) => {
    console.log(err);
    response.status(500).send(err);
  });
});

// Read from the database when the page is loaded or after a word is successfully added
// Get all the keys and values from our namespace, turn them into a JSON document
// with word and definition fields and send that to the browser
app.get("/words", function (request, response) {
    // execute a query on our database
    etcd.getAll().strings().then((values) => {
      let words = [];
      for (const key in values) {
        words.push({ "word": key, "definition": values[key] });
      }
      response.send(words);
    }
    ).catch((err) => {
      console.log(err);
      response.status(500).send(err);    
    });
  });


// Now we go and listen for a connection.
app.listen(port);

require("cf-deployment-tracker-client").track();
