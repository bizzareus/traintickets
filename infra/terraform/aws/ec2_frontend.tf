# Security Group for Frontend Next.js Web App
resource "aws_security_group" "frontend_sg" {
  name        = "${var.project_name}-frontend-sg"
  description = "Security group for ${var.project_name} frontend Next.js server"

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_allowed_cidrs
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
}

# EC2 Instance for Frontend
resource "aws_instance" "frontend" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.ssh_public_key != "" ? aws_key_pair.deployer[0].key_name : null
  vpc_security_group_ids = [aws_security_group.frontend_sg.id]

  root_block_device {
    volume_size           = 25 # GB (within AWS Free Tier 30 GB limit)
    volume_type           = "gp3"
    delete_on_termination = true
  }

  user_data = <<-EOF
              #!/bin/bash
              set -e
              
              # Add 2GB swap
              fallocate -l 2G /swapfile
              chmod 600 /swapfile
              mkswap /swapfile
              swapon /swapfile
              echo '/swapfile none swap sw 0 0' >> /etc/fstab

              # Update & install Docker & Docker Compose
              apt-get update
              apt-get install -y ca-certificates curl gnupg git
              install -m 0755 -d /etc/apt/keyrings
              curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
              chmod a+r /etc/apt/keyrings/docker.gpg
              echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
              apt-get update
              apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

              # Configure Docker default log rotation (10 files of 20MB)
              mkdir -p /etc/docker
              cat <<'DOCKER_CFG' > /etc/docker/daemon.json
              {
                "log-driver": "json-file",
                "log-opts": {
                  "max-size": "20m",
                  "max-file": "10"
                }
              }
DOCKER_CFG

              systemctl enable docker
              systemctl restart docker
              usermod -aG docker ubuntu

              # Setup application directories
              mkdir -p /home/ubuntu/app/infra
              chown -R ubuntu:ubuntu /home/ubuntu/app
              EOF

  tags = {
    Name = "${var.project_name}-frontend"
  }
}

# Elastic IP for fixed Frontend DNS
resource "aws_eip" "frontend_eip" {
  instance = aws_instance.frontend.id
  domain   = "vpc"

  tags = {
    Name = "${var.project_name}-frontend-eip"
  }
}
