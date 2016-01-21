package home

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/get3w/get3w"
)

// NewConfig initilizes an empty configuration file
func NewConfig() *Config {
	return &Config{
		Apps: []*get3w.App{},
	}
}

// LoadFromReader reads the configuration data given and sets up the auth config
// information with given directory and populates the receiver object
func (config *Config) LoadFromReader(configData io.Reader) error {
	if err := json.NewDecoder(configData).Decode(&config); err != nil {
		return err
	}

	var err error
	config.AuthConfig.Username, config.AuthConfig.Password, config.AuthConfig.AccessToken, err = DecodeAuth(config.Auth)
	if err != nil {
		return err
	}
	config.Auth = ""
	return nil
}

// LoadFromReader is a convenience function that creates a Config object from
// a reader
func LoadFromReader(configData io.Reader) (*Config, error) {
	config := Config{}
	err := config.LoadFromReader(configData)
	return &config, err
}

// LoadConfig reads the configuration files in the given directory, and sets up
// the auth config information and return values.
func LoadConfig() (*Config, error) {
	config := NewConfig()

	// Try happy path first - latest config file
	if _, err := os.Stat(configFilePath); err == nil {
		file, err := os.Open(configFilePath)
		if err != nil {
			return config, err
		}
		defer file.Close()
		err = config.LoadFromReader(file)
		for _, app := range config.Apps {
			app.From = get3w.FromLocal
		}
		return config, err
	} else if !os.IsNotExist(err) {
		// if file is there but we can't stat it for any reason other
		// than it doesn't exist then stop
		return config, err
	}
	return config, nil
}

// SaveToWriter encodes and writes out all the authorization information to
// the given writer
func (config *Config) SaveToWriter(writer io.Writer) error {
	// encode and save the authstring, while blanking out the original fields
	config.Auth = EncodeAuth(&config.AuthConfig)

	saveAuthConfig := config.AuthConfig
	defer func() { config.AuthConfig = saveAuthConfig }()

	data, err := json.MarshalIndent(config, "", "\t")
	if err != nil {
		return err
	}
	_, err = writer.Write(data)
	return err
}

// Logout user authorization
func (config *Config) Logout() error {
	config.AuthConfig = AuthConfig{}
	return config.Save()
}

// Save encodes and writes out all the authorization information
func (config *Config) Save() error {
	if err := os.MkdirAll(homeDir, 0700); err != nil {
		return err
	}
	f, err := os.OpenFile(configFilePath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	return config.SaveToWriter(f)
}

// EncodeAuth creates a base64 encoded string to containing authorization information
func EncodeAuth(authConfig *AuthConfig) string {
	if authConfig == nil || authConfig.Username == "" || authConfig.Password == "" || authConfig.AccessToken == "" {
		return ""
	}
	authStr := authConfig.Username + "\n" + authConfig.Password + "\n" + authConfig.AccessToken
	msg := []byte(authStr)
	encoded := make([]byte, base64.StdEncoding.EncodedLen(len(msg)))
	base64.StdEncoding.Encode(encoded, msg)
	return string(encoded)
}

// DecodeAuth decodes a base64 encoded string and returns username and password
func DecodeAuth(authStr string) (string, string, string, error) {
	if authStr == "" {
		return "", "", "", nil
	}
	decLen := base64.StdEncoding.DecodedLen(len(authStr))
	decoded := make([]byte, decLen)
	authByte := []byte(authStr)
	n, err := base64.StdEncoding.Decode(decoded, authByte)
	if err != nil {
		return "", "", "", err
	}
	if n > decLen {
		return "", "", "", fmt.Errorf("Something went wrong decoding auth config")
	}
	arr := strings.SplitN(string(decoded), "\n", 3)
	if len(arr) != 3 {
		return "", "", "", fmt.Errorf("Invalid auth configuration file")
	}
	username := strings.Trim(arr[0], "\x00")
	password := strings.Trim(arr[1], "\x00")
	accessToken := strings.Trim(arr[2], "\x00")
	return username, password, accessToken, nil
}
