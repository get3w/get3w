package storage

import (
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/repos"
	"gopkg.in/yaml.v2"
)

func loadConfig(config *get3w.Config, data string) error {
	if data == "" {
		return nil
	}
	return yaml.Unmarshal([]byte(data), config)
}

// IsRepo test if repository is exists
func (site *Site) IsRepo() bool {
	return site.IsExist(site.GetSourceKey(repos.KeyConfig))
}

// GetConfig get config file content
func (site *Site) GetConfig() (*get3w.Config, error) {
	if site.config == nil {
		config := &get3w.Config{}
		configData, err := site.Read(site.GetSourceKey(repos.KeyConfig))
		if err != nil {
			return nil, err
		}

		err = loadConfig(config, configData)
		if err != nil {
			return nil, err
		}

		site.config = config
	}

	return site.config, nil
}

// WriteConfig write content to config file
func (site *Site) WriteConfig(config *get3w.Config) error {
	configKey := site.GetSourceKey(repos.KeyConfig)
	yaml, err := config.String()
	if err != nil {
		return err
	}

	return site.Write(configKey, []byte(yaml))
}
