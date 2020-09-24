var Client = require('pg').Client;

export function tryConnect(opts, callback) {
    var uri = opts.url;
    var retries = opts.retries || 3;
    var retryDelay = opts.retryDelay || 5000;

    retries--;
    var client = new Client(uri);
    if (retries === 0) {
        callback(new Error('unable to connect'));
        return;
    }
    console.log('Trying to connect to PostGIS, '+retries+' retries left');

    function retry() {
        client.end(() => {
            console.log('  retrying in '+retryDelay+'ms');
            setTimeout(() => {
                tryConnect({ uri: uri, retries: retries, retryDelay: retryDelay }, callback);
            }, retryDelay);
        });
    }
    client.connect((err) => {
        if (err) {
            retry();
        } else {
            client.query('SELECT NOW()', (err, result) => {
                if (err) {
                    return retry();
                }

                console.log('Success!');
                callback(null, client);
            });
        }
    });
}



