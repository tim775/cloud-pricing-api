import { IResolvers } from 'graphql-tools';
import mingo from 'mingo';
import format from 'pg-format';
import { Product, Price } from './db/types';
import currency from './utils/currency';
import config from './config';

const productLimit = 1000;

type MongoDbFilter = { [attr: string]: { [op: string]: string | RegExp } };

type Filter = { [key: string]: string };

type AttributeFilter = {
  key: string;
  value?: string;
  // eslint-disable-next-line camelcase
  value_regex?: string;
};

interface ProductsArgs {
  filter: Filter & {
    attributeFilters: AttributeFilter[];
  };
}

interface PricesArgs {
  filter: Filter;
}

type TransformedProductAttribute = {
  key: string;
  value: string;
};

function strToRegex(str: string): RegExp {
  const pattern = (str.match(/\/(.+)\/.*/) || [''])[1];
  const options = (str.match(/\/.+\/(.*)/) || [undefined])[1];
  return new RegExp(pattern, options);
}

const resolvers: IResolvers = {
  Query: {
    products: async (
      _parent: unknown,
      args: ProductsArgs
    ): Promise<Product[]> => {
      const pool = await config.pg();

      const { attributeFilters: attribFilters, ...otherFilters } = args.filter;

      const where: string[] = [];
      Object.entries(otherFilters).forEach((filterItem) => {
        where.push(filterToCondition(filterItem[0], filterItem[1]));
      });

      if (attribFilters) {
        attribFilters.forEach((f) => {
          where.push(attributeFilterToCondition(f));
        });
      }

      const sql = format(
        `SELECT * FROM %I WHERE ${where.join(' AND ')} LIMIT %L`,
        config.productTableName,
        productLimit
      );

      const response = await pool.query(sql);
      const products = response.rows as Product[];

      return products;
    },
  },
  Product: {
    attributes: async (
      product: Product
    ): Promise<TransformedProductAttribute[]> =>
      Object.entries(product.attributes).map((a) => ({
        key: a[0],
        value: a[1],
      })),
    prices: async (product: Product, args: PricesArgs): Promise<Price[]> => {
      const prices = mingo
        .find(product.prices, transformFilter(args.filter))
        .all();
      await convertCurrencies(prices);
      return prices;
    },
  },
};

function filterToCondition(keyPart: string, value: string): string {
  const [key, opPart] = keyPart.split('_');
  if (opPart === 'regex') {
    const regex = strToRegex(value);
    return format(`%I ${regex.ignoreCase ? '~*' : '~'} %L`, key, regex.source);
  }
  if (value === '') {
    return format("(%I = '' OR %I IS NULL)", key, key, value);
  }

  return format('%I = %L', key, value);
}

function attributeFilterToCondition(filter: AttributeFilter) {
  if (filter.value_regex) {
    const regex = strToRegex(filter.value_regex);
    return format(
      `attributes ->> %L ${regex.ignoreCase ? '~*' : '~'} %L`,
      filter.key,
      regex.source
    );
  }
  if (filter.value === '') {
    return format(
      "(attributes -> %L IS NULL OR attributes ->> %L = '')",
      filter.key,
      filter.key
    );
  }
  return format('attributes ->> %L = %L', filter.key, filter.value);
}

function transformFilter(filter: Filter): MongoDbFilter {
  const transformed: MongoDbFilter = {};
  if (!filter) {
    return transformed;
  }
  Object.entries(filter).forEach((filterItem) => {
    const keyPart = filterItem[0];
    let value: any = filterItem[1]; // eslint-disable-line @typescript-eslint/no-explicit-any
    let op = '$eq';

    const [key, opPart] = keyPart.split('_');
    if (opPart === 'regex') {
      op = '$regex';
      value = strToRegex(value);
    } else if (value === '') {
      op = '$in';
      value = ['', null];
    }

    transformed[key] = {};
    transformed[key][op] = value;
  });
  return transformed;
}

async function convertCurrencies(prices: Price[]) {
  for (const price of prices) {
    if (price.USD === null && price.CNY !== null) {
      const usd = await currency.convert('CNY', 'USD', Number(price.CNY));
      price.USD = usd.toString();
    }
  }
}

export default resolvers;
