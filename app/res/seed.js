/**
 * Populate DB with sample data on server start
 * to disable, edit config/environment/index.js, and set `seedDB: false`
 */
/*jshint -W109 */

'use strict';
var User = require('./user/user.model');
var Project = require('./project/project.model');
var Bloq = require('./bloq/bloq.model');
var Category = require('./forum/models/category.model');
var Property = require('./property/property.model');

var Token = require('./recovery/token.model');

User.find({}).removeAsync()
    .then(function() {
        return User.createAsync({
                provider: 'local',
                name: 'Test User',
                email: 'test@example.com',
                password: 'test'
            }, {
                provider: 'local',
                role: 'admin',
                name: 'Admin',
                email: 'admin@example.com',
                password: 'admin'
            })
            .then(function() {
                console.log('finished populating users');
            });
    });

Token.find({}).removeAsync()
    .then(function() {
        return Token.createAsync({
                "userId": "123456",
                "token": "987654"
            })
            .then(function() {
                console.log('finished populating tokens');
            });
    });

Project.find({}).removeAsync()
    .then(function() {
        return Project.createAsync({
                "name": "proyecto1",
                "description": "mi descripcion",
                "code": "mi code",
                "_acl": {
                    'user:57164392527b27df52dbe734': {
                        permission: 'ADMIN'
                    }
                }
            }, {
                "name": "proyecto2",
                "description": "otra mas",
                "code": "codecodecodecode",
                "_acl": {
                    'user:57164392527b27df52dbe734': {
                        permission: 'READ'
                    }
                }
            })
            .then(function() {
                console.log('finished populating projects');
            });
    });