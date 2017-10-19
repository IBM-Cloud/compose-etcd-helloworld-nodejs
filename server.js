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
const { URL } = require("url");
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
var { Etcd3 } = require('etcd3');

// Now lets get cfenv and ask it to parse the environment variable
var cfenv = require('cfenv');
var appenv = cfenv.getAppEnv();

// Within the application environment (appenv) there's a services object
var services = appenv.services;

// The services object is a map named by service so we extract the one for etcd
var etcd_services = services["compose-for-etcd"];

// // This check ensures there is a services for etcd databases
assert(!util.isUndefined(etcd_services), "Must be bound to compose-for-etcd services");

// We now take the first bound etcd service and extract it's credentials object
var credentials = etcd_services[0].credentials;

// Within the credentials, an entry ca_certificate_base64 contains the SSL pinning key
// We convert that from a string into a Buffer entry in an array which we use when
// connecting.
var ca = new Buffer(credentials.ca_certificate_base64, 'base64');

// // We want to parse uri to get username, password, database name, server, port
// // So we can use those to connect to the database

connection_url=new URL(credentials.uri)
connection1_url=new URL(credentials.uri_direct_1)

var myauth = {
    username: connection_url.username,
    password: connection_url.password
};

var myhosts = [ connection_url.origin, connection1_url.origin ];

// Create auth credentials
var ioptions={ hosts: myhosts, auth: myauth, credentials: { rootCertificate: ca } }

const client=new Etcd3(ioptions)
const ns=client.namespace("/grand_tour/words/")

// We can now set up our web server. First up we set it to serve static pages
app.use(express.static(__dirname + '/public'));

app.put("/words", async function(request, response) {
  // execute a query on our database
  await ns.put(request.body.word).value(request.body.definition)
  .then(x => response.send("ok"))
  .catch(reason => console.error(reason));
});

// Read from the database when someone visits /words
app.get("/words", async function(request, response) {
    // execute a query on our database
    await ns.getAll().strings()
      .then(keys => {
        words=[]
        for (const [w,d] of Object.entries(keys)) {
          words.push( { "word" : w , "definition" : d  } );
        }     
        response.send(words);
    })
    .catch(reason => console.error(reason));    
});


// Now we go and listen for a connection.
console.log("Now listening on localhost:"+port);
app.listen(port);

require("cf-deployment-tracker-client").track();
