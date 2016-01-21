package apps

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/home"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/server/api"
	"github.com/get3w/get3w/storage"

	"github.com/labstack/echo"
)

func addFromLocal(dirPath string, config *home.Config) (string, bool, error) {
	appName := filepath.Base(dirPath)
	for _, app := range config.Apps {
		if strings.ToLower(app.Name) == strings.ToLower(appName) {
			return "", false, fmt.Errorf(`App "%s" already exists`, appName)
		}
	}
	configPath := filepath.Join(dirPath, storage.KeyConfig)
	if _, err := os.Stat(configPath); err == nil {
		return dirPath, true, nil
	}
	return dirPath, false, nil
}

func addFromCloud(dirPath, origin string, authConfig *home.AuthConfig) (string, error) {
	var err error

	nameParts := strings.SplitN(strings.Trim(origin, "/"), "/", 2)
	owner, name := nameParts[0], nameParts[1]

	appPath := filepath.Join(dirPath, name)
	parser, err := storage.NewLocalParser(authConfig.Username, appPath)
	if err != nil {
		return "", err
	}

	client := get3w.NewClient(authConfig.AccessToken)

	fmt.Printf("Getting repository '%s/%s'...\n", owner, name)

	fmt.Print("Counting objects: ")
	output, _, err := client.Apps.FilesChecksum(owner, name)
	if err != nil {
		return "", err
	}
	fmt.Printf("%d, done.\n", len(output.Files))

	for path, remoteChecksum := range output.Files {
		download := false
		if !parser.Storage.IsExist(parser.Storage.GetSourceKey(path)) {
			download = true
		} else {
			checksum, _ := parser.Storage.Checksum(parser.Storage.GetSourceKey(path))
			if checksum != remoteChecksum {
				download = true
			}
		}

		if download {
			fmt.Printf("Receiving object: %s", path)
			fileOutput, _, err := client.Apps.GetFile(owner, name, path)
			if err != nil {
				return "", err
			}
			data, err := base64.StdEncoding.DecodeString(fileOutput.Content)
			if err != nil {
				return "", err
			}
			parser.Storage.Write(parser.Storage.GetSourceKey(path), data)
			fmt.Println(", done.")
		}
	}

	// parser.Config.Repository = repo
	// err = parser.WriteConfig()
	// if err != nil {
	// 	return err
	// }

	builder, err := storage.NewLocalParser(authConfig.Username, appPath)
	if err != nil {
		return "", err
	}

	return appPath, builder.Build(true)
}

// Add app, for open and clone operation
func Add(c *echo.Context) error {
	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}
	owner := api.Owner(c)

	input := &get3w.AppAddInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	dirPath := input.DirPath
	dirExists := true
	if dirPath == "" {
		dirExists = false
	} else {
		stat, err := os.Lstat(dirPath)
		if err != nil {
			dirExists = false
		} else if !stat.IsDir() {
			dirExists = false
		}
	}
	if !dirExists {
		return api.ErrorNotFound(c, nil)
	}

	config, err := home.LoadConfig()
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	success := true
	configExists := true
	var app *get3w.App

	var appPath string
	if input.Origin != "" {
		appPath, err = addFromCloud(dirPath, input.Origin, &config.AuthConfig)
		if err != nil {
			return api.ErrorBadRequest(c, err)
		}
	} else {
		appPath, configExists, err = addFromLocal(dirPath, config)
		if err != nil {
			return api.ErrorBadRequest(c, err)
		}
	}

	if input.Check && !configExists {
		success = false
	}

	if success {
		parser, err := storage.NewLocalParser(config.AuthConfig.Username, appPath)
		if err != nil {
			return api.ErrorInternal(c, err)
		}

		app = &get3w.App{
			Owner:       owner,
			Name:        parser.Name,
			Description: parser.Config.Description,
			Tags:        "",
			Path:        appPath,
			Private:     false,
			CreatedAt:   timeutils.ToString(time.Now()),
			UpdatedAt:   timeutils.ToString(time.Now()),
		}

		exists := false
		for _, app := range config.Apps {
			if app.Path == appPath {
				exists = true
				break
			}
		}
		if !exists {
			config.Apps = append(config.Apps, app)
			config.Save()
		}
	}

	output := &get3w.AppAddOutput{
		Config: configExists,
		App:    app,
	}
	return c.JSON(http.StatusOK, output)
}
