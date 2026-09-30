import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateRefundRequestDto {
  @IsOptional()
  @IsString()
  @Matches(/^\+?\d{10,15}$/)
  mobile?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,6}$/)
  trainNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  journeyDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  txnId?: string;
}
