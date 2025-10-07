import pandas as pd
import json
import numpy as np
from datetime import datetime, timezone, timedelta

def generate_website():
    # Load the funding data
    df = pd.read_csv('funding_data_main.csv')
    
    # Load the volume data
    try:
        volume_df = pd.read_csv('ohlcv_data_main.csv')
    except FileNotFoundError:
        volume_df = pd.DataFrame()

    # Ensure 'fundingRate' is numeric
    df['fundingRate'] = pd.to_numeric(df['fundingRate'], errors='coerce')

    # Convert 'time' to datetime, ensuring it's timezone-aware
    df['time'] = pd.to_datetime(df['time'], unit='ms', utc=True)
    
    # Also convert volume data time to datetime if volume data exists
    if not volume_df.empty:
        volume_df['time'] = pd.to_datetime(volume_df['time'], unit='ms', utc=True)
    
    # Get the latest timestamp from the funding data (exchange's timestamp)
    latest_time = df['time'].max()
    
    # Calculate ADV (Average Daily Volume) for all possible day ranges (1-30)
    adv_data = {}
    if not volume_df.empty:
        # Get the latest volume data timestamp
        latest_volume_time = volume_df['time'].max()
        
        # For each day range (1-30 days)
        for days in range(1, 31):
            start_time = latest_volume_time - timedelta(days=days)
            
            # Filter volume data for the specific time range
            range_df = volume_df[volume_df['time'] > start_time]
            
            # Calculate required points (hours) for this range
            required_points = days * 24
            
            # Calculate ADV for each coin
            coin_adv = {}
            for coin in volume_df['coin'].unique():
                # Filter data for this coin in this range
                coin_data = range_df[range_df['coin'] == coin]
                
                # Only calculate ADV if we have all required data points
                if len(coin_data) >= required_points:
                    # Calculate average daily volume (sum of hourly volumes divided by number of days)
                    total_volume = coin_data['volume_usd'].sum()
                    adv = total_volume / days
                    coin_adv[coin] = adv
                else:
                    coin_adv[coin] = None
            
            # Store the ADV data for this day range
            adv_data[f"{days}d"] = coin_adv
    
    # Get the latest timestamp from the data (exchange's timestamp)
    latest_time = df['time'].max()

    # Get the current time (when the script finishes executing)
    current_time = datetime.now(timezone.utc)

    # Filter data for the latest time
    df_latest = df[df['time'] == latest_time].copy()

    # Calculate annualized funding rate percentage (hourly_funding*24*365*100)
    annualization_factor = 24 * 365 * 100  # Convert to percentage and annualize
    df_latest['fundingRate_annualized'] = df_latest['fundingRate'] * annualization_factor

    # Calculate average funding rates over different time periods
    time_periods = {
        '1d': {'days': 1, 'required_points': 24},
        '3d': {'days': 3, 'required_points': 72},
        '5d': {'days': 5, 'required_points': 120}
    }

    # Get list of all coins
    all_coins = df_latest['coin'].unique()

    # Calculate the timestamp for 7 days ago to determine "new" coins
    seven_days_ago = latest_time - timedelta(days=7)

    # Create a dictionary to store whether each coin is "new"
    new_coins = {}
    for coin in all_coins:
        # Find the earliest timestamp for this coin
        coin_data = df[df['coin'] == coin]
        earliest_timestamp = coin_data['time'].min()
        
        # A coin is "new" if it first appeared within the last 7 days
        new_coins[coin] = earliest_timestamp >= seven_days_ago

    # Prepare average funding rates per coin for each time period
    avg_funding_rates = []

    for coin in all_coins:
        coin_data = {'coin': coin, 'isNew': new_coins[coin]}
        
        # Calculate averages for each time period
        for period, config in time_periods.items():
            start_time = latest_time - timedelta(days=config['days'])
            df_period = df[(df['time'] >= start_time) & (df['coin'] == coin)]
            
            if len(df_period) >= config['required_points']:
                # Calculate annualized average
                avg_rate = df_period['fundingRate'].mean() * annualization_factor
                coin_data[f'fundingRate_avg_{period}'] = avg_rate
            else:
                # Not enough data for this coin in this period
                coin_data[f'fundingRate_avg_{period}'] = None
        
        avg_funding_rates.append(coin_data)

    df_avg = pd.DataFrame(avg_funding_rates)

    # Create separate DataFrames for each time period
    avg_dfs = {}
    for period in time_periods.keys():
        # Create column name for this period
        col_name = f'fundingRate_avg_{period}'
        
        # Filter for coins with data for this period
        df_period = df_avg[df_avg[col_name].notnull()].copy()
        
        # Separate positive and negative average funding rates
        positive_df = df_period[df_period[col_name] > 0].sort_values(by=col_name, ascending=False)
        negative_df = df_period[df_period[col_name] < 0].sort_values(by=col_name, ascending=True)
        
        avg_dfs[f'positive_{period}'] = positive_df[['coin', col_name, 'isNew']]
        avg_dfs[f'negative_{period}'] = negative_df[['coin', col_name, 'isNew']]

    # Separate positive and negative funding rates for current data
    df_positive_current = df_latest[df_latest['fundingRate_annualized'] > 0]
    df_negative_current = df_latest[df_latest['fundingRate_annualized'] < 0]

    # Sort the current funding rate tables
    df_positive_current = df_positive_current.sort_values(by='fundingRate_annualized', ascending=False)
    df_negative_current = df_negative_current.sort_values(by='fundingRate_annualized', ascending=True)

    # Add the isNew status to the current data frames
    df_positive_current['isNew'] = df_positive_current['coin'].map(new_coins)
    df_negative_current['isNew'] = df_negative_current['coin'].map(new_coins)

    # Prepare data for JSON output
    data = {
        'timestamp': latest_time.strftime('%Y-%m-%d %H:%M:%S UTC'),
        'generated_at': current_time.strftime('%Y-%m-%d %H:%M:%S UTC'),
        'positive_current': df_positive_current[['coin', 'fundingRate_annualized', 'isNew']].to_dict(orient='records'),
        'negative_current': df_negative_current[['coin', 'fundingRate_annualized', 'isNew']].to_dict(orient='records'),
        'adv_data': adv_data,  # Add ADV data for all day ranges
    }
    
    # Add average data for each time period
    for key, df in avg_dfs.items():
        data[key] = df.to_dict(orient='records')

    # Save the data to a JSON file
    with open('docs/funding_data.json', 'w') as f:
        json.dump(data, f)

    # Copy the funding_data_all_coins.csv to docs (optional)
    #df.to_csv('docs/funding_data_all_coins.csv', index=False)

    print("Website data generated successfully.")

if __name__ == '__main__':
    generate_website()
