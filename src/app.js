const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const pinoHttp = require('pino-http');
const config = require('./config');
const apolloLogger = require('./utils/apolloLogger');
const resolvers = require('./resolvers');
const typeDefs = require('./typeDefs');

function createApp(opts = {}) {
  const app = express();

  app.use(pinoHttp({
    logger: config.logger,
  }));

  const apolloConfig = {
    typeDefs,
    resolvers,
    introspection: true,
    playground: true,
    plugins: [
      apolloLogger,
    ],
    ...opts.apolloConfigOverrides,
  };

  const apollo = new ApolloServer(apolloConfig);

  apollo.applyMiddleware({ app });

  return app;
}

module.exports = createApp;
