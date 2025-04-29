resource "aws_s3_bucket" "frontend" {
  bucket = "eve-hunter"

  website {
    index_document = "index.html"
    error_document = "index.html"
  }

  tags = {
    Name = "Solo Hunter"
  }
}

resource "aws_s3_bucket_policy" "public_policy" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Principal = "*",
      Action = "s3:GetObject",
      Resource = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })
}
