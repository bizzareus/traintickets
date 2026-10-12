import { Module } from '@nestjs/common';
import { Auth0Service } from './auth0.service';
import { SearchCreditsService } from './search-credits.service';
import { SearchCreditPurchasesService } from './search-credit-purchases.service';
import { SearchCreditsSettlerService } from './search-credits-settler.service';
import { SearchCreditsController } from './search-credits.controller';

@Module({
  controllers: [SearchCreditsController],
  providers: [
    Auth0Service,
    SearchCreditsService,
    SearchCreditPurchasesService,
    SearchCreditsSettlerService,
  ],
  exports: [Auth0Service, SearchCreditsService, SearchCreditPurchasesService],
})
export class SearchCreditsModule {}
