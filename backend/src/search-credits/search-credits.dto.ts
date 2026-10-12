import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class AdmitSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  searchRequestId?: string;

  @IsString()
  @MaxLength(10)
  trainNumber!: string;

  @IsString()
  @MaxLength(10)
  from!: string;

  @IsString()
  @MaxLength(10)
  to!: string;

  @IsString()
  @MaxLength(12)
  date!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  classes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4)
  quota?: string;

  /** Cached-preview path: the result is shown immediately, so settle now. */
  @IsOptional()
  @IsBoolean()
  markCompleted?: boolean;
}

export class CompleteSearchDto {
  @IsString()
  @MaxLength(64)
  requestId!: string;

  @IsIn(['SUCCESS', 'FAILED'])
  outcome!: 'SUCCESS' | 'FAILED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  error?: string;
}

export class CreatePurchaseDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactMobile?: string;
}

export class MuzoboxCallbackDto {
  @IsString()
  @MaxLength(128)
  paymentId!: string;

  @IsString()
  @MaxLength(64)
  referenceId!: string;
}
