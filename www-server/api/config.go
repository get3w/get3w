package api

import "github.com/get3w/get3w/config"

var configFile *config.ConfigFile

// GetConfigFile returns configFile from file
func GetConfigFile() *config.ConfigFile {
	if configFile == nil {
		configFile, _ = config.Load(config.ConfigDir())
	}
	if configFile == nil {
		configFile = &config.ConfigFile{}
	}
	return configFile
}
