package cliconfig

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/get3w/get3w/pkg/homedir"
)

const (
	// ConfigFileName is the name of config file
	ConfigFileName = "config.json"
	// Version is the version of cli
	Version = "0.0.1"
)

var (
	configDir = os.Getenv("GET3W_CONFIG")
)

func init() {
	if configDir == "" {
		configDir = filepath.Join(homedir.Get(), ".get3w")
	}
}

// ConfigDir returns the directory the configuration file is stored in
func ConfigDir() string {
	return configDir
}

// SetConfigDir sets the directory the configuration file is stored in
func SetConfigDir(dir string) {
	configDir = dir
}

// AuthConfig contains authorization information
type AuthConfig struct {
	Username    string `json:"username,omitempty"`
	Password    string `json:"password,omitempty"`
	Auth        string `json:"auth"`
	AccessToken string `json:"access_token"`
}

// AppConfig constains app information
type AppConfig struct {
	LastModified string `json:"last_modified,omitempty"`
}

// ConfigFile ~/.get3w/config.json file info
type ConfigFile struct {
	AuthConfig AuthConfig            `json:"auth_config"`
	AppConfigs map[string]*AppConfig `json:"app_configs,omitempty"`
	filename   string                // Note: not serialized - for internal use only
}

// NewConfigFile initilizes an empty configuration file for the given filename 'fn'
func NewConfigFile(fn string) *ConfigFile {
	return &ConfigFile{
		AppConfigs: make(map[string]*AppConfig),
		filename:   fn,
	}
}

// LoadFromReader reads the configuration data given and sets up the auth config
// information with given directory and populates the receiver object
func (configFile *ConfigFile) LoadFromReader(configData io.Reader) error {
	if err := json.NewDecoder(configData).Decode(&configFile); err != nil {
		return err
	}

	var err error
	configFile.AuthConfig.Username, configFile.AuthConfig.Password, err = DecodeAuth(configFile.AuthConfig.Auth)
	if err != nil {
		return err
	}
	configFile.AuthConfig.Auth = ""
	return nil
}

// LoadFromReader is a convenience function that creates a ConfigFile object from
// a reader
func LoadFromReader(configData io.Reader) (*ConfigFile, error) {
	configFile := ConfigFile{}
	err := configFile.LoadFromReader(configData)
	return &configFile, err
}

// Load reads the configuration files in the given directory, and sets up
// the auth config information and return values.
// FIXME: use the internal golang config parser
func Load(configDir string) (*ConfigFile, error) {
	if configDir == "" {
		configDir = ConfigDir()
	}

	configFile := ConfigFile{
		filename: filepath.Join(configDir, ConfigFileName),
	}

	// Try happy path first - latest config file
	if _, err := os.Stat(configFile.filename); err == nil {
		file, err := os.Open(configFile.filename)
		if err != nil {
			return &configFile, err
		}
		defer file.Close()
		err = configFile.LoadFromReader(file)
		return &configFile, err
	} else if !os.IsNotExist(err) {
		// if file is there but we can't stat it for any reason other
		// than it doesn't exist then stop
		return &configFile, err
	}
	return &configFile, nil
}

// SaveToWriter encodes and writes out all the authorization information to
// the given writer
func (configFile *ConfigFile) SaveToWriter(writer io.Writer) error {
	// encode and save the authstring, while blanking out the original fields
	configFile.AuthConfig.Auth = EncodeAuth(&configFile.AuthConfig)
	configFile.AuthConfig.Username = ""
	configFile.AuthConfig.Password = ""

	saveAuthConfig := configFile.AuthConfig
	defer func() { configFile.AuthConfig = saveAuthConfig }()

	data, err := json.MarshalIndent(configFile, "", "\t")
	if err != nil {
		return err
	}
	_, err = writer.Write(data)
	return err
}

// Save encodes and writes out all the authorization information
func (configFile *ConfigFile) Save() error {
	if configFile.Filename() == "" {
		return fmt.Errorf("Can't save config with empty filename")
	}

	if err := os.MkdirAll(filepath.Dir(configFile.filename), 0700); err != nil {
		return err
	}
	f, err := os.OpenFile(configFile.filename, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer f.Close()
	return configFile.SaveToWriter(f)
}

// Filename returns the name of the configuration file
func (configFile *ConfigFile) Filename() string {
	return configFile.filename
}

// EncodeAuth creates a base64 encoded string to containing authorization information
func EncodeAuth(authConfig *AuthConfig) string {
	if authConfig == nil || authConfig.Username == "" || authConfig.Password == "" {
		return ""
	}
	authStr := authConfig.Username + ":" + authConfig.Password
	msg := []byte(authStr)
	encoded := make([]byte, base64.StdEncoding.EncodedLen(len(msg)))
	base64.StdEncoding.Encode(encoded, msg)
	return string(encoded)
}

// DecodeAuth decodes a base64 encoded string and returns username and password
func DecodeAuth(authStr string) (string, string, error) {
	if authStr == "" {
		return "", "", nil
	}
	decLen := base64.StdEncoding.DecodedLen(len(authStr))
	decoded := make([]byte, decLen)
	authByte := []byte(authStr)
	n, err := base64.StdEncoding.Decode(decoded, authByte)
	if err != nil {
		return "", "", err
	}
	if n > decLen {
		return "", "", fmt.Errorf("Something went wrong decoding auth config")
	}
	arr := strings.SplitN(string(decoded), ":", 2)
	if len(arr) != 2 {
		return "", "", fmt.Errorf("Invalid auth configuration file")
	}
	password := strings.Trim(arr[1], "\x00")
	return arr[0], password, nil
}
