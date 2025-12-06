from sklearn.ensemble import IsolationForest
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)

class AnomalyDetector:
    """
    ML-based anomaly detection for employee behavior
    Uses Isolation Forest for detecting suspicious patterns
    """
    
    def __init__(self):
        self.model = IsolationForest(
            contamination=0.1,  # Expected proportion of outliers
            random_state=42
        )
        self.is_trained = False
    
    def extract_features(self, activities: List[Dict]) -> np.ndarray:
        """
        Extract features from activity logs
        Features:
        - Hour of day
        - Day of week
        - Files accessed per hour
        - Time between accesses
        - Location variance
        """
        if not activities:
            return np.array([])
        
        features = []
        for activity in activities:
            timestamp = activity.get('timestamp')
            if isinstance(timestamp, str):
                timestamp = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            
            hour = timestamp.hour
            day_of_week = timestamp.weekday()
            
            features.append([
                hour,
                day_of_week,
                1  # access count (can be aggregated)
            ])
        
        return np.array(features)
    
    def train(self, activities: List[Dict]):
        """
        Train the anomaly detection model
        """
        features = self.extract_features(activities)
        
        if len(features) < 10:  # Need minimum data
            logger.warning("Insufficient data for training")
            return False
        
        self.model.fit(features)
        self.is_trained = True
        logger.info(f"Model trained with {len(features)} samples")
        return True
    
    def detect_anomalies(self, activities: List[Dict]) -> List[bool]:
        """
        Detect anomalies in activities
        Returns list of booleans (True = anomaly)
        """
        if not self.is_trained:
            logger.warning("Model not trained yet")
            return [False] * len(activities)
        
        features = self.extract_features(activities)
        
        if len(features) == 0:
            return []
        
        # -1 = anomaly, 1 = normal
        predictions = self.model.predict(features)
        return [pred == -1 for pred in predictions]
    
    def analyze_employee_behavior(self, activities: List[Dict]) -> Dict:
        """
        Analyze employee behavior and return insights
        """
        if not activities:
            return {
                "total_activities": 0,
                "suspicious_count": 0,
                "risk_level": "low",
                "patterns": []
            }
        
        anomalies = self.detect_anomalies(activities)
        suspicious_count = sum(anomalies)
        
        # Calculate risk level
        risk_ratio = suspicious_count / len(activities) if activities else 0
        if risk_ratio > 0.3:
            risk_level = "high"
        elif risk_ratio > 0.15:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        # Identify patterns
        patterns = []
        if suspicious_count > 0:
            suspicious_activities = [act for act, is_anomaly in zip(activities, anomalies) if is_anomaly]
            patterns.append(f"Detected {suspicious_count} unusual access patterns")
            
            # Check for off-hours access
            off_hours = [act for act in suspicious_activities 
                        if isinstance(act.get('timestamp'), datetime) and 
                        (act['timestamp'].hour < 9 or act['timestamp'].hour > 17)]
            if off_hours:
                patterns.append(f"Off-hours access detected: {len(off_hours)} instances")
        
        return {
            "total_activities": len(activities),
            "suspicious_count": suspicious_count,
            "risk_level": risk_level,
            "patterns": patterns
        }
