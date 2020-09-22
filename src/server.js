const app = require('./app');
const config = require('./config');

app().listen(config.port, '0.0.0.0', () => {
  config.logger.info(`🚀  Server ready at http://0.0.0.0:${config.port}/`);
});
