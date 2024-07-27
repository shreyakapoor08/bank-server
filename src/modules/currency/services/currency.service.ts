import { HttpService, Injectable, Logger } from '@nestjs/common';
import { PageMetaDto } from 'common/dtos';
import { ForeignExchangeRatesNotFoundException } from 'exceptions';
import {
  CurrenciesPageDto,
  CurrenciesPageOptionsDto,
} from 'modules/currency/dtos';
import { CurrencyEntity } from 'modules/currency/entities';
import { CurrencyRepository } from 'modules/currency/repositories';

@Injectable()
export class CurrencyService {
  private readonly logger = new Logger(CurrencyService.name);

  constructor(
    private readonly _currencyRepository: CurrencyRepository,
    private readonly _httpService: HttpService,
  ) {}

  public async getCurrencies(
    pageOptionsDto: CurrenciesPageOptionsDto,
  ): Promise<CurrenciesPageDto | undefined> {
    const queryBuilder = this._currencyRepository.createQueryBuilder(
      'currency',
    );

    const [currencies, currenciesCount] = await queryBuilder
      .skip(pageOptionsDto.skip)
      .take(pageOptionsDto.take)
      .getManyAndCount();

    const pageMetaDto = new PageMetaDto({
      pageOptionsDto,
      itemCount: currenciesCount,
    });

    return new CurrenciesPageDto(currencies.toDtos(), pageMetaDto);
  }

  public async findCurrency(
    options: Partial<{ uuid: string; name: string }>,
  ): Promise<CurrencyEntity | undefined> {
    const queryBuilder = this._currencyRepository.createQueryBuilder(
      'currency',
    );

    if (options.uuid) {
      queryBuilder.orWhere('currency.uuid = :uuid', {
        uuid: options.uuid,
      });
    }

    if (options.name) {
      queryBuilder.orWhere('currency.name = :name', {
        name: options.name,
      });
    }

    return queryBuilder.getOne();
  }

  public async upsertCurrencyForeignExchangeRates(
    name: string,
    currentExchangeRate: number,
    base: boolean,
  ): Promise<void> {
    const queryBuilder = this._currencyRepository.createQueryBuilder(
      'currency',
    );

    await queryBuilder
      .insert()
      .values({ name, currentExchangeRate, base })
      .onConflict(
        `("name") DO UPDATE
                SET current_exchange_rate = :currentExchangeRate`,
      )
      .setParameter('currentExchangeRate', currentExchangeRate)
      .execute();
  }

  public async getCurrencyForeignExchangeRates() {
    try {
      const [EUR, USD] = await Promise.all([
        this.getCurrencyForeignExchangeRatesForEUR(),
        this.getCurrencyForeignExchangeRatesForUSD(),
      ]);

      if (!EUR.rates || !EUR.rates[0] || !USD.rates || !USD.rates[0]) {
        throw new Error('Invalid response structure from exchange rates API');
      }

      const midEUR = 1 / ((EUR.rates[0].bid + EUR.rates[0].ask) / 2);
      const midUSD = 1 / ((USD.rates[0].bid + USD.rates[0].ask) / 2);

      return [
        { name: EUR.code, currentExchangeRate: midEUR },
        { name: USD.code, currentExchangeRate: midUSD },
      ];
    } catch (error) {
      this.logger.error('Error fetching foreign exchange rates', error.stack);
      throw new ForeignExchangeRatesNotFoundException(error);
    }
  }

  public async getCurrencyForeignExchangeRatesForUSD(): Promise<any> {
    const endpoint = `https://api.nbp.pl/api/exchangerates/rates/c/usd/2024-07-26/?format=json`;

    return this._httpService
      .get(endpoint)
      .toPromise()
      .then((response) => {
        this.logger.debug(`USD exchange rate response: ${JSON.stringify(response.data)}`);
        return response.data;
      })
      .catch((error) => {
        this.logger.error('Error fetching USD exchange rate', error.stack);
        throw new ForeignExchangeRatesNotFoundException(error);
      });
  }

  public async getCurrencyForeignExchangeRatesForEUR(): Promise<any> {
    const endpoint = `https://api.nbp.pl/api/exchangerates/rates/c/eur/2024-07-26/?format=json`;

    return this._httpService
      .get(endpoint)
      .toPromise()
      .then((response) => {
        this.logger.debug(`EUR exchange rate response: ${JSON.stringify(response.data)}`);
        return response.data;
      })
      .catch((error) => {
        this.logger.error('Error fetching EUR exchange rate', error.stack);
        throw new ForeignExchangeRatesNotFoundException(error);
      });
  }
}
