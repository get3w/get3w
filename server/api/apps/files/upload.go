package files

import (
	"io"
	"io/ioutil"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/server/api"
	"github.com/get3w/get3w/storage"

	"github.com/labstack/echo"
	"github.com/labstack/echo/engine/standard"
)

// Upload files
func Upload() echo.HandlerFunc {
	return func(c echo.Context) error {
		appPath := c.Param("app_path")
		if appPath == "" {
			return api.ErrorNotFound(c, nil)
		}

		if api.IsAnonymous(c) {
			return api.ErrorUnauthorized(c, nil)
		}
		location := c.Query("location")

		app, err := api.GetApp(appPath)
		if err != nil {
			return api.ErrorInternal(c, err)
		}
		if app == nil {
			return api.ErrorNotFound(c, nil)
		}

		parser, err := storage.NewLocalParser(api.Owner(c), appPath)
		if err != nil {
			return api.ErrorInternal(c, err)
		}

		req := c.Request().(*standard.Request)
		mr, err := req.MultipartReader()
		if err != nil {
			return api.ErrorInternal(c, err)
		}

		files := []*get3w.File{}
		for {
			part, err := mr.NextPart()
			if err != nil {
				if err == io.EOF {
					break
				}
				return api.ErrorInternal(c, err)
			}
			defer part.Close()

			data, err := ioutil.ReadAll(part)
			if err != nil {
				return api.ErrorInternal(c, err)
			}

			filename := part.FileName()
			err = parser.Storage.Write(parser.Storage.GetSourceKey(location, filename), data)
			if err != nil {
				return api.ErrorInternal(c, err)
			}

			file := &get3w.File{
				IsDir:        false,
				Path:         strings.Trim(path.Join(location, filename), "/"),
				Name:         filename,
				Size:         0,
				Checksum:     "",
				LastModified: timeutils.ToString(time.Now()),
			}

			files = append(files, file)
		}

		return c.JSON(http.StatusOK, files)
	}
}
