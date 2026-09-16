# ------------------------------------------------------------------------------
# Serverless Seat Cache Pipeline (DynamoDB + SQS + Lambda + EventBridge)
# 100% Free Tier Compatible (ap-south-1)
# ------------------------------------------------------------------------------

# 1. DynamoDB Table for Caching Seat Availability Matrix
resource "aws_dynamodb_table" "train_seat_cache" {
  name           = "${var.project_name}-train-seat-cache"
  billing_mode   = "PROVISIONED"
  table_class    = "STANDARD"
  read_capacity  = 10
  write_capacity = 10
  hash_key       = "trainNumber"
  range_key      = "dateClass"

  attribute {
    name = "trainNumber"
    type = "S"
  }

  attribute {
    name = "dateClass"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }

  tags = {
    Name = "${var.project_name}-train-seat-cache"
  }
}

# 2. SQS Queues (Standard Queue + DLQ)
resource "aws_sqs_queue" "seat_cache_dlq" {
  name                      = "${var.project_name}-seat-cache-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "seat_cache_queue" {
  name                       = "${var.project_name}-seat-cache-queue"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 86400 # 1 day

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.seat_cache_dlq.arn
    maxReceiveCount     = 3
  })
}

# 3. Zip Archives for Lambda Code
data "archive_file" "producer_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../lambdas/seat-cache-producer"
  output_path = "${path.module}/build/producer.zip"
}

data "archive_file" "worker_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../../lambdas/seat-cache-worker"
  output_path = "${path.module}/build/worker.zip"
}

# 4. IAM Roles & Policies for Producer Lambda
resource "aws_iam_role" "producer_role" {
  name = "${var.project_name}-seat-cache-producer-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "producer_basic_execution" {
  role       = aws_iam_role.producer_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "producer_sqs_policy" {
  name        = "${var.project_name}-producer-sqs-policy"
  description = "Allows producer lambda to publish messages to SQS queue"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:SendMessageBatch"
        ]
        Resource = aws_sqs_queue.seat_cache_queue.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "producer_sqs_attach" {
  role       = aws_iam_role.producer_role.name
  policy_arn = aws_iam_policy.producer_sqs_policy.arn
}

# 5. IAM Roles & Policies for Worker Lambda
resource "aws_iam_role" "worker_role" {
  name = "${var.project_name}-seat-cache-worker-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "worker_basic_execution" {
  role       = aws_iam_role.worker_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "worker_permissions" {
  name        = "${var.project_name}-worker-sqs-dynamo-policy"
  description = "Allows worker lambda to consume SQS and write to DynamoDB"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.seat_cache_queue.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:UpdateItem"
        ]
        Resource = aws_dynamodb_table.train_seat_cache.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "worker_permissions_attach" {
  role       = aws_iam_role.worker_role.name
  policy_arn = aws_iam_policy.worker_permissions.arn
}

# 6. Lambda Functions
resource "aws_lambda_function" "producer" {
  function_name    = "${var.project_name}-seat-cache-producer"
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.producer_zip.output_path
  source_code_hash = data.archive_file.producer_zip.output_base64sha256
  timeout          = 30
  memory_size      = 256
  role             = aws_iam_role.producer_role.arn

  environment {
    variables = {
      QUEUE_URL = aws_sqs_queue.seat_cache_queue.id
    }
  }

  tags = {
    Name = "${var.project_name}-seat-cache-producer"
  }
}

resource "aws_lambda_function" "worker" {
  function_name    = "${var.project_name}-seat-cache-worker"
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.worker_zip.output_path
  source_code_hash = data.archive_file.worker_zip.output_base64sha256
  timeout          = 60
  memory_size      = 256
  role             = aws_iam_role.worker_role.arn

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.train_seat_cache.name
      API_URL    = "https://${var.api_domain_name}"
    }
  }

  tags = {
    Name = "${var.project_name}-seat-cache-worker"
  }
}

# 7. SQS Event Source Mapping for Worker Lambda
resource "aws_lambda_event_source_mapping" "worker_sqs_trigger" {
  event_source_arn = aws_sqs_queue.seat_cache_queue.arn
  function_name    = aws_lambda_function.worker.arn
  batch_size       = 10
  enabled          = true

  scaling_config {
    maximum_concurrency = 3
  }
}

# 8. EventBridge Daily Cron Trigger (03:00 AM IST = 21:30 UTC)
resource "aws_cloudwatch_event_rule" "daily_seat_sync" {
  name                = "${var.project_name}-daily-seat-sync"
  description         = "Triggers seat cache producer daily at 03:00 IST"
  schedule_expression = "cron(30 21 * * ? *)"
}

resource "aws_cloudwatch_event_target" "producer_target" {
  rule      = aws_cloudwatch_event_rule.daily_seat_sync.name
  target_id = "TriggerSeatCacheProducer"
  arn       = aws_lambda_function.producer.arn
}

resource "aws_lambda_permission" "allow_eventbridge_to_invoke_producer" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.producer.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_seat_sync.arn
}

# 9. Outputs
output "seat_cache_dynamodb_table_name" {
  description = "DynamoDB table name for train seat cache"
  value       = aws_dynamodb_table.train_seat_cache.name
}

output "seat_cache_sqs_queue_url" {
  description = "SQS queue URL for train availability sync"
  value       = aws_sqs_queue.seat_cache_queue.id
}
