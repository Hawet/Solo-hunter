provider "aws" {
  region = var.aws_region
}


resource "aws_key_pair" "deployer" {
  key_name   = "deployer-key"
  public_key = file("${path.module}/../deployer-key.pub")
}