import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class JourneyRequestDto {
  @IsString()
  @Matches(/^\d{4,6}$/)
  trainNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  trainName?: string;

  @IsString()
  @MaxLength(10)
  fromStationCode!: string;

  @IsString()
  @MaxLength(10)
  toStationCode!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  journeyDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  classCode?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  stationCodesToMonitor?: string[];

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?\d{10,15}$/)
  mobile?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  trainStartDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentRef?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}(?::\d{2})?$/)
  chartTimeLocal?: string;

  @IsOptional()
  @IsInt()
  @Min(-10)
  @Max(10)
  chartOneDayOffset?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}(?::\d{2})?$/)
  chartTwoTimeLocal?: string;

  @IsOptional()
  @IsInt()
  @Min(-10)
  @Max(10)
  chartTwoDayOffset?: number;
}
