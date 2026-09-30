import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const GENDERS = ['Male', 'Female', 'Transgender'] as const;

class SplitBookingPassengerDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsInt()
  @Min(5)
  @Max(125)
  age!: number;

  @IsIn(GENDERS)
  gender!: (typeof GENDERS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(30)
  berthPreference?: string;

  @IsOptional()
  @IsBoolean()
  seniorCitizen?: boolean;
}

class SplitBookingChildPassengerDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsInt()
  @Min(0)
  @Max(4)
  age!: number;

  @IsIn(GENDERS)
  gender!: (typeof GENDERS)[number];
}

class SplitBookingLegDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  boardingDate!: string;

  @IsString()
  @MaxLength(10)
  from!: string;

  @IsString()
  @MaxLength(10)
  to!: string;

  @IsString()
  @MaxLength(5)
  travelClass!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  fare!: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  departureTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  arrivalTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  durationMinutes?: number;
}

export class CreateSplitBookingDto {
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

  @IsString()
  @MaxLength(5)
  travelClass!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  quota?: string;

  @IsInt()
  @Min(1)
  @Max(200_000)
  totalFare!: number;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => SplitBookingLegDto)
  legs!: SplitBookingLegDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => SplitBookingPassengerDto)
  passengers!: SplitBookingPassengerDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => SplitBookingChildPassengerDto)
  childPassengers?: SplitBookingChildPassengerDto[];

  @IsOptional()
  @IsBoolean()
  autoUpgrade?: boolean;

  @IsString()
  @Matches(/^\+?\d{10,15}$/)
  contactMobile!: string;

  @IsEmail()
  @MaxLength(254)
  contactEmail!: string;
}
