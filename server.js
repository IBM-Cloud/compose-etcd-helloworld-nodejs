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
var port = process.env.VCAP_APP_PORT || 8080;

// Then we'll pull in the database client library
var Etcd = require('node-etcd');

// Now lets get cfenv and ask it to parse the environment variable
var cfenv = require('cfenv');
var appenv = cfenv.getAppEnv();

// Within the application environment (appenv) there's a services object
var services = appenv.services;

// The services object is a map named by service so we extract the one for etcd
var etcd_services = services["compose-for-etcd"];

// This check ensures there is a services for MongoDB databases
assert(!util.isUndefined(etcd_services), "Must be bound to compose-for-etcd services");

// We now take the first bound MongoDB service and extract it's credentials object
var credentials = etcd_services[0].credentials;

// Within the credentials, an entry ca_certificate_base64 contains the SSL pinning key
// We convert that from a string into a Buffer entry in an array which we use when
// connecting.
var ca = new Buffer(credentials.ca_certificate_base64, 'base64');
//var connectionString = credentials.uri;

// We want to parse uri-cli to get username, password, database name, server, port
// So we can use those to connect to the database

var parts = credentials.uri_cli.split(" ");
var hosts = parts[5].split(",");
var userpass = parts[7].split(":");
var auth = {
    user: userpass[0],
    pass: userpass[1]
};


// Create auth credentials
var opts = {
    auth: auth,
    ca: ca
}

// We can now set up our web server. First up we set it to serve static pages
app.use(express.static(__dirname + '/public'));

app.put("/words", function(request, response) {
  // set up a new client using our config details
  var etcd = new Etcd(hosts, opts);
  // execute a query on our database
  etcd.set(request.body.word,request.body.definition,function(err,result) {
    if (err) throw err;
    response.send("ok");
  });

});

// Read from the database when someone visits /hello
app.get("/words", function(request, response) {
    // set up a new client using our config details
    var etcd = new Etcd(hosts, opts);
    // execute a query on our database
    etcd.get('/', function(err, result) {
      if (err) {
        response.status(500).send(err);
      } else {
        // get the words from the index
        var words = [];
        result.node.nodes.forEach(function(word){
          words.push( { "word" : word.key , "definition" : word.value  } );
        });
        response.send(words);
      }
    });
});


// Now we go and listen for a connection.
app.listen(port);

require("cf-deployment-tracker-client").track();
