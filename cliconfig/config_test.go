package cliconfig

import (
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEmptyConfigDir(t *testing.T) {
	tmpHome, err := ioutil.TempDir("", "config-test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpHome)

	SetConfigDir(tmpHome)

	config, err := Load("")
	if err != nil {
		t.Fatalf("Failed loading on empty config dir: %q", err)
	}

	expectedConfigFilename := filepath.Join(tmpHome, ConfigFileName)
	if config.Filename() != expectedConfigFilename {
		t.Fatalf("Expected config filename %s, got %s", expectedConfigFilename, config.Filename())
	}

	// Now save it and make sure it shows up in new form
	saveConfigAndValidateNewFormat(t, config, tmpHome)
}

func TestMissingFile(t *testing.T) {
	tmpHome, err := ioutil.TempDir("", "config-test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpHome)

	config, err := Load(tmpHome)
	if err != nil {
		t.Fatalf("Failed loading on missing file: %q", err)
	}

	// Now save it and make sure it shows up in new form
	saveConfigAndValidateNewFormat(t, config, tmpHome)
}

func TestSaveFileToDirs(t *testing.T) {
	tmpHome, err := ioutil.TempDir("", "config-test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpHome)

	tmpHome += "/.docker"

	config, err := Load(tmpHome)
	if err != nil {
		t.Fatalf("Failed loading on missing file: %q", err)
	}

	// Now save it and make sure it shows up in new form
	saveConfigAndValidateNewFormat(t, config, tmpHome)
}

func TestEmptyFile(t *testing.T) {
	tmpHome, err := ioutil.TempDir("", "config-test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpHome)

	fn := filepath.Join(tmpHome, ConfigFileName)
	if err := ioutil.WriteFile(fn, []byte(""), 0600); err != nil {
		t.Fatal(err)
	}

	_, err = Load(tmpHome)
	if err == nil {
		t.Fatalf("Was supposed to fail")
	}
}

func TestEmptyJson(t *testing.T) {
	tmpHome, err := ioutil.TempDir("", "config-test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpHome)

	fn := filepath.Join(tmpHome, ConfigFileName)
	if err := ioutil.WriteFile(fn, []byte("{}"), 0600); err != nil {
		t.Fatal(err)
	}

	config, err := Load(tmpHome)
	if err != nil {
		t.Fatalf("Failed loading on empty json file: %q", err)
	}

	// Now save it and make sure it shows up in new form
	saveConfigAndValidateNewFormat(t, config, tmpHome)
}

func TestNewJson(t *testing.T) {
	tmpHome, err := ioutil.TempDir("", "config-test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpHome)

	fn := filepath.Join(tmpHome, ConfigFileName)
	js := ` { "auths": { "https://index.docker.io/v1/": { "auth": "am9lam9lOmhlbGxv", "email": "user@example.com" } } }`
	if err := ioutil.WriteFile(fn, []byte(js), 0600); err != nil {
		t.Fatal(err)
	}

	config, err := Load(tmpHome)
	if err != nil {
		t.Fatalf("Failed loading on empty json file: %q", err)
	}

	ac := config.AuthConfigs["https://index.docker.io/v1/"]
	if ac.Email != "user@example.com" || ac.Username != "joejoe" || ac.Password != "hello" {
		t.Fatalf("Missing data from parsing:\n%q", config)
	}

	// Now save it and make sure it shows up in new form
	configStr := saveConfigAndValidateNewFormat(t, config, tmpHome)

	if !strings.Contains(configStr, "user@example.com") {
		t.Fatalf("Should have save in new form: %s", configStr)
	}
}

// Save it and make sure it shows up in new form
func saveConfigAndValidateNewFormat(t *testing.T, config *ConfigFile, homeFolder string) string {
	err := config.Save()
	if err != nil {
		t.Fatalf("Failed to save: %q", err)
	}

	buf, err := ioutil.ReadFile(filepath.Join(homeFolder, ConfigFileName))
	if !strings.Contains(string(buf), `"auths":`) {
		t.Fatalf("Should have save in new form: %s", string(buf))
	}
	return string(buf)
}

func TestConfigDir(t *testing.T) {
	tmpHome, err := ioutil.TempDir("", "config-test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpHome)

	if ConfigDir() == tmpHome {
		t.Fatalf("Expected ConfigDir to be different than %s by default, but was the same", tmpHome)
	}

	// Update configDir
	SetConfigDir(tmpHome)

	if ConfigDir() != tmpHome {
		t.Fatalf("Expected ConfigDir to %s, but was %s", tmpHome, ConfigDir())
	}
}

func TestConfigFile(t *testing.T) {
	configFilename := "configFilename"
	configFile := NewConfigFile(configFilename)

	if configFile.Filename() != configFilename {
		t.Fatalf("Expected %s, got %s", configFilename, configFile.Filename())
	}
}

func TestJsonReaderNoFile(t *testing.T) {
	js := ` { "auths": { "https://index.docker.io/v1/": { "auth": "am9lam9lOmhlbGxv", "email": "user@example.com" } } }`

	config, err := LoadFromReader(strings.NewReader(js))
	if err != nil {
		t.Fatalf("Failed loading on empty json file: %q", err)
	}

	ac := config.AuthConfigs["https://index.docker.io/v1/"]
	if ac.Email != "user@example.com" || ac.Username != "joejoe" || ac.Password != "hello" {
		t.Fatalf("Missing data from parsing:\n%q", config)
	}

}

func TestOldJsonReaderNoFile(t *testing.T) {
	js := `{"https://index.docker.io/v1/":{"auth":"am9lam9lOmhlbGxv","email":"user@example.com"}}`

	config, err := LegacyLoadFromReader(strings.NewReader(js))
	if err != nil {
		t.Fatalf("Failed loading on empty json file: %q", err)
	}

	ac := config.AuthConfigs["https://index.docker.io/v1/"]
	if ac.Email != "user@example.com" || ac.Username != "joejoe" || ac.Password != "hello" {
		t.Fatalf("Missing data from parsing:\n%q", config)
	}
}

func TestJsonWithPsFormatNoFile(t *testing.T) {
	js := `{
		"auths": { "https://index.docker.io/v1/": { "auth": "am9lam9lOmhlbGxv", "email": "user@example.com" } },
		"psFormat": "table {{.ID}}\\t{{.Label \"com.docker.label.cpu\"}}"
}`
	_, err := LoadFromReader(strings.NewReader(js))
	if err != nil {
		t.Fatalf("Failed loading on empty json file: %q", err)
	}

}

func TestJsonSaveWithNoFile(t *testing.T) {
	js := `{
		"auths": { "https://index.docker.io/v1/": { "auth": "am9lam9lOmhlbGxv", "email": "user@example.com" } },
		"psFormat": "table {{.ID}}\\t{{.Label \"com.docker.label.cpu\"}}"
}`
	config, err := LoadFromReader(strings.NewReader(js))
	err = config.Save()
	if err == nil {
		t.Fatalf("Expected error. File should not have been able to save with no file name.")
	}

	tmpHome, err := ioutil.TempDir("", "config-test")
	if err != nil {
		t.Fatalf("Failed to create a temp dir: %q", err)
	}
	defer os.RemoveAll(tmpHome)

	fn := filepath.Join(tmpHome, ConfigFileName)
	f, _ := os.OpenFile(fn, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	err = config.SaveToWriter(f)
	if err != nil {
		t.Fatalf("Failed saving to file: %q", err)
	}
	buf, err := ioutil.ReadFile(filepath.Join(tmpHome, ConfigFileName))
	if !strings.Contains(string(buf), `"auths":`) ||
		!strings.Contains(string(buf), "user@example.com") {
		t.Fatalf("Should have save in new form: %s", string(buf))
	}

}
func TestLegacyJsonSaveWithNoFile(t *testing.T) {

	js := `{"https://index.docker.io/v1/":{"auth":"am9lam9lOmhlbGxv","email":"user@example.com"}}`
	config, err := LegacyLoadFromReader(strings.NewReader(js))
	err = config.Save()
	if err == nil {
		t.Fatalf("Expected error. File should not have been able to save with no file name.")
	}

	tmpHome, err := ioutil.TempDir("", "config-test")
	if err != nil {
		t.Fatalf("Failed to create a temp dir: %q", err)
	}
	defer os.RemoveAll(tmpHome)

	fn := filepath.Join(tmpHome, ConfigFileName)
	f, _ := os.OpenFile(fn, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	err = config.SaveToWriter(f)
	if err != nil {
		t.Fatalf("Failed saving to file: %q", err)
	}
	buf, err := ioutil.ReadFile(filepath.Join(tmpHome, ConfigFileName))
	if !strings.Contains(string(buf), `"auths":`) ||
		!strings.Contains(string(buf), "user@example.com") {
		t.Fatalf("Should have save in new form: %s", string(buf))
	}
}
