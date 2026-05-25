import logging
import sys
import json
from datetime import datetime
from app.config import settings

import os

# Setup basic JSON formatter for production, standard format for dev
class CustomFormatter(logging.Formatter):
    def format(self, record):
        if os.getenv("ENVIRONMENT", "development") == "production":
            log_obj = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
                "module": record.module,
                "funcName": record.funcName,
                "lineNo": record.lineno,
            }
            if record.exc_info:
                log_obj["exc_info"] = self.formatException(record.exc_info)
            return json.dumps(log_obj)
        else:
            return super().format(record)

def setup_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    
    # Only configure if no handlers exist to prevent duplicate logs
    if not logger.handlers:
        logger.setLevel(logging.INFO if os.getenv("ENVIRONMENT", "development") == "production" else logging.DEBUG)
        
        handler = logging.StreamHandler(sys.stdout)
        
        if os.getenv("ENVIRONMENT", "development") == "production":
            formatter = CustomFormatter()
        else:
            formatter = logging.Formatter(
                fmt="%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S"
            )
            
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
    return logger

# Create a default logger for immediate use
logger = setup_logger("insight_ai")
