import pymysql
conn = pymysql.connect(
    host="mysql-25ee43b3-system.a.aivencloud.com",
    port=25581,
    user="avnadmin",
    password="",
    database="elythong_repair"
)

def get_connection():
    try:
        conn = pymysql.connect(
            host="localhost",      # or your server IP
            user="root",           # your MySQL username
            password="",           # your MySQL password
            database="elythong_repair"
        )
        print("✅ Connected to MySQL")
        return conn
    except pymysql.Error as err:
        print("❌ Error:", err)
        return None


# Test connection
if __name__ == "__main__":
    connection = get_connection()
    if connection:
        cursor = connection.cursor()
        cursor.execute("SHOW TABLES;")
        
        print("📂 Tables:")
        for table in cursor:
            print(table)

        connection.close()
        print("🔌 Connection closed")