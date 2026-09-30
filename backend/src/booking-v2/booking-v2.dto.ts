import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const DATE_PATTERN = /^(?:\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})$/;

export class AlternatePathsDto {
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
  @Matches(DATE_PATTERN)
  date!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  avlClasses?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  classes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(4)
  quota?: string;

  @IsOptional()
  @IsBoolean()
  forceRefresh?: boolean;
}

export class BestTrainsDto {
  @IsString()
  @MaxLength(10)
  from!: string;

  @IsString()
  @MaxLength(10)
  to!: string;

  @IsString()
  @Matches(DATE_PATTERN)
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  quota?: string;

  @IsOptional()
  @IsBoolean()
  acOnly?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  classes?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxTrains?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsObject({ each: true })
  trains?: Array<Record<string, unknown>>;
}
