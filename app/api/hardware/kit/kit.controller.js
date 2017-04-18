'use strict';

var Kit = require('./kit.model.js');

var perPage = 20;

/**
 * Get public Kit list
 */
exports.get = function(req, res) {
    var query = req.query.query ? JSON.parse(req.query.query) : {};

    Kit.find(query)
        .sort({
            name: 'asc'
        }).exec(function(err, kits) {
            if (err) {
                console.log(err);
                err.code = parseInt(err.code) || 500;
                res.status(err.code).send(err);
            } else {
                res.status(200).json(kits);
            }
        });

};