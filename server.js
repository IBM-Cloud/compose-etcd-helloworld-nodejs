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

'use strict';
/* jshint node:true */

// Add the express web framework
const express = require('express');
const app = express();
const { URL } = require('url');

// Use body-parser to handle the PUT data
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({
    extended: false
}));

// Then we'll pull in the database client library
const { Etcd3 } = require('etcd3');

// Util is handy to have around, so thats why that's here.
const util = require('util')

// and so is assert
const assert = require('assert');

// We want to extract the port to publish our app on
let port = process.env.PORT || 8080;

// Now lets get cfenv and ask it to parse the environment variable
const cfenv = require('cfenv');

// load local VCAP configuration  and service credentials
let vcapLocal;
try {
  vcapLocal = require('./vcap-local.json');
  console.log("Loaded local VCAP");
} catch (e) { 
    // console.log(e)
}

const appEnvOpts = vcapLocal ? { vcap: vcapLocal} : {}
const appEnv = cfenv.getAppEnv(appEnvOpts);

// Within the application environment (appenv) there's a services object
let services = appEnv.services;

// The services object is a map named by service so we extract the one for etcd
let etcd_services = services["compose-for-etcd"];

// This check ensures there is a services for etcd databases
assert(!util.isUndefined(etcd_services), "Must be bound to compose-for-etcd services");

// We now take the first bound etcd service and extract it's credentials object
let credentials = etcd_services[0].credentials;

// We want to parse uri_cli from the credentials to get endpoints and username and password 
// So we can use those to connect to the database
let parts = credentials.uri_cli.split(" ");

let endpoints = parts[2].split("=")[1];
let usercred = parts[3].split("=");
let userpass = usercred[1].split(":");

// Create auth credentials
let opts = {
  hosts: endpoints.split(","),
  auth: {
      username: userpass[0],
      password: userpass[1]
  }
};

var etcd = new Etcd3(opts).namespace("/example/words/");

// We can now set up our web server. First up we set it to serve static pages
app.use(express.static(__dirname + '/public'));

// Add a word to the database
function addWord(word, definition) {
    return new Promise(function(resolve, reject) {
        etcd.put(word).value(definition).then(() => {
            resolve();
        }).catch((err) => {
            reject(err);
        });
    });
}

// Get words from the database
function getWords() {
    return new Promise(function(resolve, reject) {
        etcd.getAll().strings().then((values) => {
            let words = [];
            for (const key in values) {
                words.push({ "word": key, "definition": values[key] });
            }
            resolve(words);
        }).catch((err) => {
            reject(err);
        });
    });
}

// The user has clicked submit to add a word and definition to the database
// Send the data to the addWord function and send a response if successful
app.put("/words", function(request, response) {
    addWord(request.body.word, request.body.definition)
        .then(function(resp) {
            response.send(resp);
        })
        .catch(function(err) {
            console.log(err);
            response.status(500).send(err);
        });
});

// Read from the database when the page is loaded or after a word is successfully added
// Use the getWords function to get a list of words and definitions from the database
app.get("/words", function(request, response) {
    getWords()
        .then(function(words) {
            response.send(words);
        })
        .catch(function(err) {
            console.log(err);
            response.status(500).send(err);
        });
});

// Listen for a connection.
app.listen(port, function() {
    console.log('Server is listening on port ' + port);
});
