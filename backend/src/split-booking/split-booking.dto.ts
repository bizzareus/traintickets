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
const FOOD_CHOICES = ['Veg', 'Non-Veg', 'No Food', ''] as const;

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
  optBerth?: boolean;

  @IsOptional()
  @IsIn(FOOD_CHOICES)
  foodChoice?: (typeof FOOD_CHOICES)[number];

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
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SplitBookingLegDto)
  legs!: SplitBookingLegDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  @ValidateNested({ each: true })
  @Type(() => SplitBookingPassengerDto)
  passengers!: SplitBookingPassengerDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(0)
  @ValidateNested({ each: true })
  @Type(() => SplitBookingChildPassengerDto)
  childPassengers?: SplitBookingChildPassengerDto[];

  @IsOptional()
  @IsBoolean()
  autoUpgrade?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmBerthsOnly?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  preferredCoach?: string;

  @IsOptional()
  @IsBoolean()
  travelInsurance?: boolean;

  @IsString()
  @Matches(/^\+?\d{10,15}$/)
  contactMobile!: string;

  @IsEmail()
  @MaxLength(254)
  contactEmail!: string;
}

export class LookupCancellationDto {
  @IsString()
  @MaxLength(50)
  bookingRef!: string;

  @IsString()
  @Matches(/^\+?\d{10,15}$/)
  mobile!: string;
}

export class CreateCancellationRequestDto {
  @IsString()
  @MaxLength(50)
  bookingRef!: string;

  @IsString()
  @Matches(/^\+?\d{10,15}$/)
  mobile!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminUpdateCancellationDto {
  @IsOptional()
  @IsIn(['PENDING', 'PROCESSED', 'REJECTED'])
  status?: 'PENDING' | 'PROCESSED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;
}
