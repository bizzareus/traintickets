import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class Service2CheckDto {
  @IsString()
  @MaxLength(10)
  trainNumber!: string;

  @IsString()
  @MaxLength(10)
  stationCode!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  journeyDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  classCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  destinationStation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  passengerDetails?: string;

  @IsOptional()
  @IsBoolean()
  forceVacantBerth?: boolean;
}
