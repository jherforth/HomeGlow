const net = require('node:net');

// A port the OS says is free right now. Picking at random from a fixed range
// lands on a port another program holds often enough to matter (see
// homeAssistant.test.js's 30-second start-up stalls with Docker on 8080).
function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

module.exports = { freePort };
