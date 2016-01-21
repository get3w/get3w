package home

import (
	"path/filepath"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/homedir"
)

const (
	// ConfigDirName is the config directory name
	ConfigDirName = ".get3w"
	// RootConfigName is the name of root config file
	RootConfigName = "config.json"
	// Version is the version of cli
	Version = "0.0.1"
)

var (
	homeDir        string
	configFilePath string
)

func init() {
	if homeDir == "" {
		homeDir = filepath.Join(homedir.Get(), ConfigDirName)
		configFilePath = filepath.Join(homeDir, RootConfigName)
	}
}

// Path get home path
func Path(relatedPath string) string {
	return filepath.Join(homeDir, relatedPath)
}

// AuthConfig contains authorization information
type AuthConfig struct {
	Username    string
	Password    string
	AccessToken string
}

// Config ~/.get3w/config.json file info
type Config struct {
	Auth       string       `json:"auth"`
	Apps       []*get3w.App `json:"apps,omitempty"`
	AuthConfig AuthConfig   `json:"-"`
}
